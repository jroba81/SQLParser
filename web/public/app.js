// State
const state = {
    connectionId: null,
    selectedProcedure: null,
    network: null,
    nodes: null,
    edges: null,
    nodeIdCounter: 1000
};

// API Base URL
const API_URL = 'http://localhost:3000/api';

// DOM Elements
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const proceduresPanel = document.getElementById('procedures-panel');
const proceduresList = document.getElementById('procedures-list');
const statusBar = document.getElementById('status');
const networkContainer = document.getElementById('network');
const nodeDetails = document.getElementById('node-details');
const nodeDetailsContent = document.getElementById('node-details-content');
const addWhereBtn = document.getElementById('add-where-btn');
const resetViewBtn = document.getElementById('reset-view-btn');

// Initialize Network
function initNetwork() {
    const data = {
        nodes: new vis.DataSet([]),
        edges: new vis.DataSet([])
    };

    const options = {
        nodes: {
            shape: 'box',
            margin: 10,
            font: {
                size: 14,
                face: 'Segoe UI'
            },
            borderWidth: 2,
            shadow: true
        },
        edges: {
            arrows: 'to',
            smooth: {
                type: 'cubicBezier',
                roundness: 0.5
            },
            color: {
                color: '#848484',
                highlight: '#2980b9'
            },
            width: 2
        },
        physics: {
            enabled: true,
            stabilization: {
                enabled: true,
                iterations: 200
            },
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.3,
                springLength: 150,
                springConstant: 0.04
            }
        },
        interaction: {
            hover: true,
            navigationButtons: true,
            keyboard: true
        },
        layout: {
            hierarchical: {
                enabled: false
            }
        }
    };

    state.network = new vis.Network(networkContainer, data, options);
    state.nodes = data.nodes;
    state.edges = data.edges;

    // Event listeners
    state.network.on('click', onNodeClick);
    state.network.on('doubleClick', onNodeDoubleClick);
}

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
        div.addEventListener('click', () => selectProcedure(proc));
        proceduresList.appendChild(div);
    });
}

// Select and Parse Procedure
async function selectProcedure(procedure) {
    // Update UI
    document.querySelectorAll('.procedure-item').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

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

        // Parse procedure
        const parseResponse = await fetch(`${API_URL}/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sqlText: defResult.definition })
        });

        const parseResult = await parseResponse.json();

        if (parseResult.success) {
            visualizeStatements(parseResult.data.statements, procedure.name);
            setStatus(`Parsed ${parseResult.data.statements.length} statements`, 'success');
        } else {
            setStatus(`Parse error: ${parseResult.message}`, 'error');
        }
    } catch (error) {
        setStatus(`Error: ${error.message}`, 'error');
    }
}

// Visualize Statements as Network
function visualizeStatements(statements, procedureName) {
    state.nodes.clear();
    state.edges.clear();

    if (statements.length === 0) {
        setStatus('No DML statements found', 'info');
        return;
    }

    const colors = {
        INSERT: '#3498db',
        UPDATE: '#e67e22',
        DELETE: '#e74c3c',
        table: '#2ecc71',
        column: '#9b59b6',
        where: '#f39c12'
    };

    // Add procedure node
    const procNodeId = `proc_${procedureName}`;
    state.nodes.add({
        id: procNodeId,
        label: procedureName,
        color: '#34495e',
        font: { size: 16, color: 'white' },
        level: 0
    });

    statements.forEach((stmt, index) => {
        // Statement node
        const stmtId = `stmt_${index}`;
        state.nodes.add({
            id: stmtId,
            label: `${stmt.statementType}\\nLine ${stmt.lineNumber}`,
            color: colors[stmt.statementType],
            font: { color: 'white' },
            level: 1,
            data: stmt
        });

        state.edges.add({
            from: procNodeId,
            to: stmtId,
            label: `Statement ${index + 1}`
        });

        // Tables
        const tableIds = [];
        stmt.tables.forEach(table => {
            const tableId = `table_${index}_${table}`;
            tableIds.push(tableId);

            state.nodes.add({
                id: tableId,
                label: table,
                color: colors.table,
                font: { color: 'white' },
                level: 2,
                data: { type: 'table', value: table, statementIndex: index }
            });

            state.edges.add({
                from: stmtId,
                to: tableId,
                label: 'uses'
            });
        });

        // Columns
        stmt.columns.forEach((column, colIdx) => {
            const colId = `col_${index}_${colIdx}`;

            state.nodes.add({
                id: colId,
                label: column,
                color: colors.column,
                font: { color: 'white' },
                level: 3,
                data: { type: 'column', value: column, statementIndex: index }
            });

            state.edges.add({
                from: stmtId,
                to: colId,
                label: stmt.statementType === 'DELETE' ? 'affects' : 'modifies'
            });
        });

        // WHERE clauses
        stmt.whereClauseElements.forEach((where, whereIdx) => {
            const whereId = `where_${index}_${whereIdx}`;

            state.nodes.add({
                id: whereId,
                label: where,
                color: colors.where,
                font: { color: 'white', size: 12 },
                level: 2,
                data: {
                    type: 'where',
                    value: where,
                    statementIndex: index,
                    editable: true
                }
            });

            state.edges.add({
                from: stmtId,
                to: whereId,
                label: 'WHERE',
                dashes: true
            });
        });
    });

    // Fit the view
    setTimeout(() => {
        state.network.fit({
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        });
    }, 500);
}

// Node Click Event
function onNodeClick(params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = state.nodes.get(nodeId);

        if (node && node.data) {
            showNodeDetails(node);
        }
    }
}

// Node Double Click Event
function onNodeDoubleClick(params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = state.nodes.get(nodeId);

        if (node && node.data && node.data.editable) {
            editWhereClause(node);
        }
    }
}

// Show Node Details
function showNodeDetails(node) {
    nodeDetails.classList.remove('hidden');

    let html = `<p><strong>Type:</strong> ${node.data.type || 'Statement'}</p>`;

    if (node.data.statementType) {
        html += `<p><strong>Statement:</strong> ${node.data.statementType}</p>`;
        html += `<p><strong>Line:</strong> ${node.data.lineNumber}</p>`;
        html += `<p><strong>Tables:</strong> ${node.data.tables.join(', ')}</p>`;
        html += `<p><strong>Columns:</strong> ${node.data.columns.join(', ')}</p>`;
        if (node.data.whereClauseElements.length > 0) {
            html += `<p><strong>WHERE Conditions:</strong></p><ul>`;
            node.data.whereClauseElements.forEach(w => {
                html += `<li style="font-size: 11px; margin-left: 20px;">${w}</li>`;
            });
            html += '</ul>';
        }
    } else {
        html += `<p><strong>Value:</strong> ${node.data.value || node.label}</p>`;
        if (node.data.editable) {
            html += `<p style="color: #3498db; font-size: 11px; margin-top: 10px;">Double-click to edit</p>`;
        }
    }

    nodeDetailsContent.innerHTML = html;
}

// Edit WHERE Clause
function editWhereClause(node) {
    const newValue = prompt('Edit WHERE condition:', node.data.value);

    if (newValue && newValue !== node.data.value) {
        state.nodes.update({
            id: node.id,
            label: newValue,
            data: { ...node.data, value: newValue }
        });

        setStatus('WHERE condition updated', 'success');
    }
}

// Add New WHERE Condition
function addWhereCondition() {
    const condition = prompt('Enter new WHERE condition:', 'column = value');

    if (!condition) return;

    const statementNodes = state.nodes.get({
        filter: n => n.data && n.data.statementType
    });

    if (statementNodes.length === 0) {
        setStatus('No statements to add condition to', 'error');
        return;
    }

    // Add to the first statement (or could show a selector)
    const stmt = statementNodes[0];
    const whereId = `where_custom_${state.nodeIdCounter++}`;

    state.nodes.add({
        id: whereId,
        label: condition,
        color: '#f39c12',
        font: { color: 'white', size: 12 },
        level: 2,
        data: {
            type: 'where',
            value: condition,
            statementIndex: stmt.data.statementIndex,
            editable: true,
            custom: true
        }
    });

    state.edges.add({
        from: stmt.id,
        to: whereId,
        label: 'WHERE (custom)',
        dashes: true,
        color: { color: '#f39c12' }
    });

    setStatus('WHERE condition added', 'success');
}

// Reset View
function resetView() {
    if (state.network) {
        state.network.fit({
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        });
    }
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
    proceduresPanel.classList.add('hidden');
    connectBtn.classList.remove('hidden');
    disconnectBtn.classList.add('hidden');
    nodeDetails.classList.add('hidden');

    if (state.nodes) {
        state.nodes.clear();
        state.edges.clear();
    }

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

// Event Listeners
connectBtn.addEventListener('click', connectToDatabase);
disconnectBtn.addEventListener('click', disconnect);
addWhereBtn.addEventListener('click', addWhereCondition);
resetViewBtn.addEventListener('click', resetView);

// Initialize
initNetwork();
setStatus('Ready - Connect to a database to begin', 'info');
