const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { spawn } = require('child_process');
const mssql = require('mssql');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database connections (stored in memory for demo)
const connections = new Map();

// API Routes

/**
 * Test database connection
 */
app.post('/api/connect', async (req, res) => {
    const { type, host, port, database, username, password, connectionId } = req.body;

    try {
        let connection;

        if (type === 'sqlserver') {
            const config = {
                server: host,
                port: port || 1433,
                database: database,
                user: username,
                password: password,
                options: {
                    encrypt: true,
                    trustServerCertificate: true
                }
            };

            connection = await mssql.connect(config);
            connections.set(connectionId, { type: 'sqlserver', connection, config });

        } else if (type === 'mysql') {
            connection = await mysql.createConnection({
                host: host,
                port: port || 3306,
                database: database,
                user: username,
                password: password
            });

            connections.set(connectionId, { type: 'mysql', connection });
        }

        res.json({ success: true, message: 'Connected successfully' });

    } catch (error) {
        console.error('Connection error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get list of stored procedures
 */
app.get('/api/procedures/:connectionId', async (req, res) => {
    const { connectionId } = req.params;
    const conn = connections.get(connectionId);

    if (!conn) {
        return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    try {
        let procedures = [];

        if (conn.type === 'sqlserver') {
            const result = await conn.connection.request().query(`
                SELECT
                    SCHEMA_NAME(p.schema_id) AS schema_name,
                    p.name AS procedure_name,
                    p.create_date,
                    p.modify_date
                FROM sys.procedures p
                ORDER BY schema_name, procedure_name
            `);

            procedures = result.recordset.map(row => ({
                schema: row.schema_name,
                name: row.procedure_name,
                fullName: `${row.schema_name}.${row.procedure_name}`,
                created: row.create_date,
                modified: row.modify_date
            }));

        } else if (conn.type === 'mysql') {
            const [rows] = await conn.connection.query(`
                SELECT
                    ROUTINE_SCHEMA,
                    ROUTINE_NAME,
                    CREATED,
                    LAST_ALTERED
                FROM information_schema.ROUTINES
                WHERE ROUTINE_TYPE = 'PROCEDURE'
                AND ROUTINE_SCHEMA = DATABASE()
                ORDER BY ROUTINE_NAME
            `);

            procedures = rows.map(row => ({
                schema: row.ROUTINE_SCHEMA,
                name: row.ROUTINE_NAME,
                fullName: `${row.ROUTINE_SCHEMA}.${row.ROUTINE_NAME}`,
                created: row.CREATED,
                modified: row.LAST_ALTERED
            }));
        }

        res.json({ success: true, procedures });

    } catch (error) {
        console.error('Error fetching procedures:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get stored procedure definition
 */
app.get('/api/procedure/:connectionId/:schema/:name', async (req, res) => {
    const { connectionId, schema, name } = req.params;
    const conn = connections.get(connectionId);

    if (!conn) {
        return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    try {
        let definition = '';

        if (conn.type === 'sqlserver') {
            const result = await conn.connection.request()
                .input('schema', mssql.VarChar, schema)
                .input('name', mssql.VarChar, name)
                .query(`
                    SELECT m.definition
                    FROM sys.sql_modules m
                    JOIN sys.procedures p ON m.object_id = p.object_id
                    WHERE SCHEMA_NAME(p.schema_id) = @schema
                    AND p.name = @name
                `);

            definition = result.recordset[0]?.definition || '';

        } else if (conn.type === 'mysql') {
            const [rows] = await conn.connection.query(
                `SHOW CREATE PROCEDURE \`${schema}\`.\`${name}\``
            );

            definition = rows[0]['Create Procedure'] || '';
        }

        res.json({ success: true, definition });

    } catch (error) {
        console.error('Error fetching procedure definition:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Parse stored procedure using C# parser
 */
app.post('/api/parse', async (req, res) => {
    const { sqlText } = req.body;

    try {
        // Call the C# parser using dotnet run
        const projectPath = path.join(__dirname, '..');

        const child = spawn('dotnet', ['run', '--', '--json', '--stdin'], {
            cwd: projectPath,
            shell: true
        });

        let stdout = '';
        let stderr = '';

        // Send SQL text to stdin
        child.stdin.write(sqlText);
        child.stdin.end();

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error('Parser stderr:', stderr);
                return res.status(500).json({
                    success: false,
                    message: 'Parser failed',
                    error: stderr,
                    exitCode: code
                });
            }

            try {
                // Extract JSON from output (skip the header lines)
                const lines = stdout.split('\n');
                let jsonStart = -1;

                // Find the first line that starts with '{'
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim().startsWith('{')) {
                        jsonStart = i;
                        break;
                    }
                }

                if (jsonStart === -1) {
                    return res.status(500).json({
                        success: false,
                        message: 'No JSON found in parser output',
                        output: stdout
                    });
                }

                const jsonOutput = lines.slice(jsonStart).join('\n');
                const parsed = JSON.parse(jsonOutput);
                res.json({ success: true, data: parsed });
            } catch (e) {
                console.error('JSON parse error:', e);
                console.error('Output was:', stdout);
                res.status(500).json({
                    success: false,
                    message: 'Failed to parse JSON output',
                    error: e.message,
                    output: stdout
                });
            }
        });

        child.on('error', (error) => {
            console.error('Spawn error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to start parser',
                error: error.message
            });
        });

    } catch (error) {
        console.error('Parse error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Disconnect from database
 */
app.post('/api/disconnect/:connectionId', async (req, res) => {
    const { connectionId } = req.params;
    const conn = connections.get(connectionId);

    if (!conn) {
        return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    try {
        if (conn.type === 'sqlserver') {
            await conn.connection.close();
        } else if (conn.type === 'mysql') {
            await conn.connection.end();
        }

        connections.delete(connectionId);
        res.json({ success: true, message: 'Disconnected successfully' });

    } catch (error) {
        console.error('Disconnect error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`SQL Parser Web Server running on http://localhost:${PORT}`);
});
