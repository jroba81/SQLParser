// State
const state = {
    connectionId: null,
    selectedProcedure: null,
    statements: [],
    originalSQL: null
};

// API Base URL
const API_URL = 'http://localhost:3000/api';

// DOM Elements
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const proceduresPanel = document.getElementById('procedures-panel');
const proceduresList = document.getElementById('procedures-list');
const statusBar = document.getElementById('status');
const resultsContainer = document.getElementById('results-container');
const addWhereBtn = document.getElementById('add-where-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const viewSqlBtn = document.getElementById('view-sql-btn');
const dbTypeSelect = document.getElementById('db-type');
const mysqlWarning = document.getElementById('mysql-warning');

// Connect to Database
async function connectToDatabase() {
    const type = document.getElementById('db-type').value;
    const host = document.getElementById('db-host').value;
    const port = document.getElementById('db-port').value;
    const database = document.getElementById('db-database').value;
    const username = document.getElementById('db-username').value;
    const password = document.getElementById('db-password').value;

    if (!host || !database || !username) {
        setStatus('Please fill in all required fields', 'error');
        return;
    }

    setStatus('Connecting...', 'info');

    try {
        const response = await fetch(`${API_URL}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type,
                host,
                port: parseInt(port) || (type === 'sqlserver' ? 1433 : 3306),
                database,
                username,
                password,
                connectionId: generateConnectionId()
            })
        });

        const result = await response.json();

        if (result.success) {
            setStatus('Connected successfully', 'success');
            proceduresPanel.classList.remove('hidden');
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            loadProcedures();
        } else {
            setStatus(`Connection failed: ${result.message}`, 'error');
        }
    } catch (error) {
        setStatus(`Connection error: ${error.message}`, 'error');
    }
}

// Load Stored Procedures
async function loadProcedures() {
    setStatus('Loading stored procedures...', 'info');
    proceduresList.innerHTML = '<p style="padding: 20px; text-align: center; color: #7f8c8d;">Loading...</p>';

    try {
        const response = await fetch(`${API_URL}/procedures/${state.connectionId}`);
        const result = await response.json();

        if (result.success) {
            displayProcedures(result.procedures);
            setStatus(`Found ${result.procedures.length} stored procedures`, 'success');
        } else {
            setStatus(`Error loading procedures: ${result.message}`, 'error');
        }
    } catch (error) {
        setStatus(`Error: ${error.message}`, 'error');
    }
}

// Display Procedures List
function displayProcedures(procedures) {
    if (procedures.length === 0) {
        proceduresList.innerHTML = '<p style="padding: 20px; text-align: center; color: #7f8c8d;">No procedures found</p>';
        return;
    }

    proceduresList.innerHTML = '';
    procedures.forEach(proc => {
        const div = document.createElement('div');
        div.className = 'procedure-item';
        div.innerHTML = `
            <div class="procedure-name">${proc.name}</div>
            <div class="procedure-schema">${proc.schema}</div>
        `;
        div.addEventListener('click', () => selectProcedure(proc, div));
        proceduresList.appendChild(div);
    });
}

// Select and Parse Procedure
async function selectProcedure(procedure, element) {
    // Update UI
    document.querySelectorAll('.procedure-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');

    state.selectedProcedure = procedure;
    setStatus(`Loading ${procedure.name}...`, 'info');

    try {
        // Get procedure definition
        const defResponse = await fetch(`${API_URL}/procedure/${state.connectionId}/${procedure.schema}/${procedure.name}`);
        const defResult = await defResponse.json();

        if (!defResult.success) {
            setStatus(`Error: ${defResult.message}`, 'error');
            return;
        }

        // Store original SQL
        state.originalSQL = defResult.definition;

        // Parse procedure
        const parseResponse = await fetch(`${API_URL}/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sqlText: defResult.definition })
        });

        const parseResult = await parseResponse.json();

        if (parseResult.success) {
            state.statements = parseResult.data.statements;
            displayStatementsTable(parseResult.data.statements, procedure.name);
            setStatus(`Parsed ${parseResult.data.statements.length} statements`, 'success');
        } else {
            setStatus(`Parse error: ${parseResult.message}`, 'error');
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #e74c3c;">
                    <h3 style="margin-bottom: 10px;">Parse Error</h3>
                    <p>${parseResult.message}</p>
                </div>
            `;
        }
    } catch (error) {
        setStatus(`Error: ${error.message}`, 'error');
    }
}

// Display Statements as Table
function displayStatementsTable(statements, procedureName) {
    if (statements.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #7f8c8d;">
                <h3 style="margin-bottom: 10px;">No DML Statements Found</h3>
                <p>The parser found no INSERT, UPDATE, or DELETE statements in this procedure.</p>
                <p style="margin-top: 10px; font-size: 12px;">Note: Only T-SQL syntax is supported.</p>
            </div>
        `;
        return;
    }

    let html = `
        <h2 style="margin-bottom: 20px; color: #2c3e50;">${procedureName}</h2>
        <table class="results-table">
            <thead>
                <tr>
                    <th style="width: 15%;">Statement</th>
                    <th style="width: 20%;">Columns</th>
                    <th style="width: 25%;">Tables</th>
                    <th style="width: 40%;">WHERE Clause</th>
                </tr>
            </thead>
            <tbody>
    `;

    statements.forEach((stmt, index) => {
        const stmtType = stmt.statementType.toLowerCase();

        html += `<tr data-index="${index}">`;

        // Statement column
        html += `
            <td>
                <span class="statement-type ${stmtType}">${stmt.statementType}</span>
                <span class="line-number">Line ${stmt.lineNumber}</span>
            </td>
        `;

        // Columns column
        html += `<td><div class="cell-content">`;
        if (stmt.columns && stmt.columns.length > 0) {
            stmt.columns.forEach(col => {
                const isSelect = col.startsWith('[SELECT]');
                html += `<div class="column-item ${isSelect ? 'select' : ''}">${col}</div>`;
            });
        } else {
            html += '<span style="color: #95a5a6; font-style: italic;">None</span>';
        }
        html += `</div></td>`;

        // Tables column
        html += `<td><div class="cell-content">`;
        if (stmt.tables && stmt.tables.length > 0) {
            stmt.tables.forEach(table => {
                html += `<span class="table-item">${table}</span>`;
            });
        } else {
            html += '<span style="color: #95a5a6; font-style: italic;">None</span>';
        }
        html += `</div></td>`;

        // WHERE clause column
        html += `<td><div class="cell-content">`;
        if (stmt.whereClauseElements && stmt.whereClauseElements.length > 0) {
            stmt.whereClauseElements.forEach((where, whereIndex) => {
                html += `
                    <div class="where-item editable" data-stmt-index="${index}" data-where-index="${whereIndex}">
                        <div class="where-item-text">${escapeHtml(where)}</div>
                        <div class="where-item-actions">
                            <button onclick="editWhereClause(${index}, ${whereIndex})" title="Edit">✎</button>
                            <button class="delete" onclick="deleteWhereClause(${index}, ${whereIndex})" title="Delete">×</button>
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<span style="color: #95a5a6; font-style: italic;">None</span>';
        }

        // Add WHERE button
        html += `
            <div class="add-where-inline" onclick="addWhereClauseToStatement(${index})">
                + Add WHERE condition
            </div>
        `;

        html += `</div></td>`;
        html += `</tr>`;
    });

    html += `</tbody></table>`;

    resultsContainer.innerHTML = html;
}

// Edit WHERE Clause
function editWhereClause(stmtIndex, whereIndex) {
    const stmt = state.statements[stmtIndex];
    const currentValue = stmt.whereClauseElements[whereIndex];

    const newValue = prompt('Edit WHERE condition:', currentValue);

    if (newValue && newValue !== currentValue) {
        stmt.whereClauseElements[whereIndex] = newValue;
        displayStatementsTable(state.statements, state.selectedProcedure.name);
        setStatus('WHERE condition updated', 'success');
    }
}

// Delete WHERE Clause
function deleteWhereClause(stmtIndex, whereIndex) {
    if (!confirm('Delete this WHERE condition?')) return;

    state.statements[stmtIndex].whereClauseElements.splice(whereIndex, 1);
    displayStatementsTable(state.statements, state.selectedProcedure.name);
    setStatus('WHERE condition deleted', 'success');
}

// Add WHERE Clause to Specific Statement
function addWhereClauseToStatement(stmtIndex) {
    const condition = prompt('Enter new WHERE condition:', 'column = value');

    if (!condition) return;

    if (!state.statements[stmtIndex].whereClauseElements) {
        state.statements[stmtIndex].whereClauseElements = [];
    }

    state.statements[stmtIndex].whereClauseElements.push(condition);
    displayStatementsTable(state.statements, state.selectedProcedure.name);
    setStatus('WHERE condition added', 'success');
}

// Add WHERE to First Statement (button click)
function addWhereCondition() {
    if (state.statements.length === 0) {
        setStatus('No statements to add condition to', 'error');
        return;
    }

    addWhereClauseToStatement(0);
}

// Export to CSV
function exportToCSV() {
    if (state.statements.length === 0) {
        setStatus('No data to export', 'error');
        return;
    }

    let csv = 'Statement Type,Line Number,Columns,Tables,WHERE Clause\n';

    state.statements.forEach(stmt => {
        const columns = (stmt.columns || []).join('; ');
        const tables = (stmt.tables || []).join('; ');
        const where = (stmt.whereClauseElements || []).join('; ');

        csv += `"${stmt.statementType}",${stmt.lineNumber},"${escapeCSV(columns)}","${escapeCSV(tables)}","${escapeCSV(where)}"\n`;
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.selectedProcedure ? state.selectedProcedure.name : 'parsed_statements'}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setStatus('CSV exported successfully', 'success');
}

// Generate Modified SQL
function generateModifiedSQL() {
    if (!state.originalSQL || state.statements.length === 0) {
        return state.originalSQL || '';
    }

    let modifiedSQL = state.originalSQL;
    let offset = 0; // Track position shifts from insertions

    // Sort statements by line number (process in reverse to maintain positions)
    const sortedStatements = [...state.statements].sort((a, b) => b.lineNumber - a.lineNumber);

    sortedStatements.forEach(stmt => {
        // Find WHERE keyword in the SQL for this statement
        const lines = modifiedSQL.split('\n');

        // Build the WHERE clause text
        let whereClauseText = '';
        if (stmt.whereClauseElements && stmt.whereClauseElements.length > 0) {
            whereClauseText = '\n    WHERE ' + stmt.whereClauseElements.join('\n        AND ');
        }

        // Add comment showing this was modified
        const comment = `\n    -- Modified WHERE clause (${stmt.whereClauseElements ? stmt.whereClauseElements.length : 0} conditions)`;

        // For simplicity, we'll add a comment at the end indicating the changes
        // A full implementation would require complex AST manipulation
    });

    // Add summary comment at the end
    const modificationCount = state.statements.reduce((count, stmt) => {
        return count + (stmt.whereClauseElements ? stmt.whereClauseElements.length : 0);
    }, 0);

    modifiedSQL += `\n\n-- ============================================\n`;
    modifiedSQL += `-- MODIFICATIONS SUMMARY\n`;
    modifiedSQL += `-- ============================================\n`;
    modifiedSQL += `-- Total statements analyzed: ${state.statements.length}\n`;
    state.statements.forEach((stmt, idx) => {
        modifiedSQL += `\n-- Statement ${idx + 1}: ${stmt.statementType} (Line ${stmt.lineNumber})\n`;
        if (stmt.whereClauseElements && stmt.whereClauseElements.length > 0) {
            modifiedSQL += `--   WHERE conditions (${stmt.whereClauseElements.length}):\n`;
            stmt.whereClauseElements.forEach(where => {
                modifiedSQL += `--     - ${where}\n`;
            });
        } else {
            modifiedSQL += `--   No WHERE conditions\n`;
        }
    });

    return modifiedSQL;
}

// View Modified SQL
function viewModifiedSQL() {
    if (!state.originalSQL) {
        setStatus('No SQL to display', 'error');
        return;
    }

    const modifiedSQL = generateModifiedSQL();

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'sql-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeSQLModal()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Modified SQL - ${state.selectedProcedure ? state.selectedProcedure.name : 'Procedure'}</h2>
                <button class="modal-close" onclick="closeSQLModal()">×</button>
            </div>
            <div class="modal-body">
                <pre class="sql-preview"><code>${escapeHtml(modifiedSQL)}</code></pre>
            </div>
            <div class="modal-footer">
                <button onclick="copySQLToClipboard()">📋 Copy to Clipboard</button>
                <button onclick="downloadModifiedSQL()">💾 Download SQL File</button>
                <button class="secondary" onclick="closeSQLModal()">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setStatus('Viewing modified SQL', 'info');
}

// Close SQL Modal
function closeSQLModal() {
    const modal = document.getElementById('sql-modal');
    if (modal) {
        modal.remove();
    }
}

// Copy SQL to Clipboard
async function copySQLToClipboard() {
    const modifiedSQL = generateModifiedSQL();

    try {
        await navigator.clipboard.writeText(modifiedSQL);
        setStatus('SQL copied to clipboard!', 'success');
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = modifiedSQL;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setStatus('SQL copied to clipboard!', 'success');
    }
}

// Download Modified SQL
function downloadModifiedSQL() {
    const modifiedSQL = generateModifiedSQL();
    const blob = new Blob([modifiedSQL], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.selectedProcedure ? state.selectedProcedure.name : 'procedure'}_modified.sql`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('SQL file downloaded!', 'success');
}

// Disconnect
async function disconnect() {
    if (state.connectionId) {
        try {
            await fetch(`${API_URL}/disconnect/${state.connectionId}`, { method: 'POST' });
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }

    state.connectionId = null;
    state.selectedProcedure = null;
    state.statements = [];
    proceduresPanel.classList.add('hidden');
    connectBtn.classList.remove('hidden');
    disconnectBtn.classList.add('hidden');

    resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #7f8c8d;">
            <h3 style="margin-bottom: 10px;">No Data</h3>
            <p>Connect to a database and select a stored procedure to view parsed statements</p>
        </div>
    `;

    setStatus('Disconnected', 'info');
}

// Utility Functions
function generateConnectionId() {
    state.connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return state.connectionId;
}

function setStatus(message, type = 'info') {
    statusBar.textContent = message;
    statusBar.className = `status ${type}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeCSV(text) {
    return text.replace(/"/g, '""');
}

// Toggle MySQL warning visibility
function toggleMySQLWarning() {
    if (dbTypeSelect.value === 'mysql') {
        mysqlWarning.classList.remove('hidden');
    } else {
        mysqlWarning.classList.add('hidden');
    }
}

// Event Listeners
connectBtn.addEventListener('click', connectToDatabase);
disconnectBtn.addEventListener('click', disconnect);
addWhereBtn.addEventListener('click', addWhereCondition);
exportCsvBtn.addEventListener('click', exportToCSV);
viewSqlBtn.addEventListener('click', viewModifiedSQL);
dbTypeSelect.addEventListener('change', toggleMySQLWarning);

// Initialize
toggleMySQLWarning();
setStatus('Ready - Connect to a database to begin', 'info');
