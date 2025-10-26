# SQL Parser Web Interface

An interactive web application for visualizing SQL Server stored procedures as network graphs.

## ⚠️ Important Limitation

**The parser only supports SQL Server T-SQL syntax.** While you can connect to and browse MySQL databases, the parser uses Microsoft's ScriptDom library which only understands SQL Server T-SQL syntax. MySQL stored procedures will not parse correctly.

**Supported**: SQL Server 2012+ (T-SQL syntax)
**Browse Only**: MySQL (connection and browsing work, but parsing will fail or return 0 statements)

## Features

- **Database Connectivity**: Connect to SQL Server databases (MySQL browsing supported but parsing is T-SQL only)
- **Procedure Browser**: Browse and select stored procedures from your database
- **Network Visualization**: View parsed procedures as interactive network graphs using vis.js
- **Interactive WHERE Clauses**: Add, edit, and modify WHERE clause conditions
- **Real-time Parsing**: Parse stored procedures on-demand using the C# parser backend

## Architecture

```
web/
├── server.js          # Express server with database connections
├── package.json       # Node.js dependencies
├── public/
│   ├── index.html     # Main web interface
│   └── app.js         # Frontend JavaScript application
└── README.md          # This file
```

## Installation

### Prerequisites

- Node.js 16+ and npm
- .NET 8.0 SDK
- SQL Server or MySQL database (for testing)

### Setup

1. **Install Node.js dependencies:**

```bash
cd web
npm install
```

2. **Build the C# parser:**

```bash
cd ..
dotnet build
```

## Usage

### Start the Web Server

```bash
cd web
npm start
```

The server will start on `http://localhost:3000`

### Development Mode (with auto-reload)

```bash
npm run dev
```

## Using the Application

### 1. Connect to Database

1. Open `http://localhost:3000` in your browser
2. Select database type (SQL Server or MySQL)
3. Enter connection details:
   - Host (e.g., `localhost`)
   - Port (1433 for SQL Server, 3306 for MySQL)
   - Database name
   - Username and password
4. Click **Connect**

### 2. Browse Stored Procedures

- Once connected, the list of stored procedures appears in the sidebar
- Click on any procedure to load and visualize it

### 3. Explore the Network Graph

The network visualization shows:

- **Blue nodes**: INSERT statements
- **Orange nodes**: UPDATE statements
- **Red nodes**: DELETE statements
- **Green nodes**: Tables
- **Purple nodes**: Columns
- **Yellow nodes**: WHERE clause conditions

### 4. Interact with Nodes

- **Click** a node to view details in the sidebar
- **Double-click** a WHERE clause node to edit it
- **Click "Add WHERE Condition"** to add custom WHERE clauses
- **Drag** nodes to rearrange the layout
- **Scroll** to zoom in/out
- **Click and drag** background to pan

### 5. Navigation Controls

- **Reset View**: Fit all nodes in the viewport
- **Navigation buttons**: Use built-in zoom and pan controls
- **Keyboard**: Arrow keys to pan, +/- to zoom

## API Endpoints

The Express server provides these REST endpoints:

### POST /api/connect
Connect to a database

**Request:**
```json
{
  "type": "sqlserver",
  "host": "localhost",
  "port": 1433,
  "database": "MyDB",
  "username": "user",
  "password": "pass",
  "connectionId": "conn_unique_id"
}
```

### GET /api/procedures/:connectionId
Get list of stored procedures

**Response:**
```json
{
  "success": true,
  "procedures": [
    {
      "schema": "dbo",
      "name": "GetCustomer",
      "fullName": "dbo.GetCustomer",
      "created": "2024-01-01T00:00:00Z",
      "modified": "2024-01-15T00:00:00Z"
    }
  ]
}
```

### GET /api/procedure/:connectionId/:schema/:name
Get stored procedure definition

**Response:**
```json
{
  "success": true,
  "definition": "CREATE PROCEDURE ..."
}
```

### POST /api/parse
Parse SQL text

**Request:**
```json
{
  "sqlText": "CREATE PROCEDURE ..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "statements": [
      {
        "statementType": "INSERT",
        "lineNumber": 10,
        "columns": ["col1", "col2"],
        "tables": ["table1", "table2"],
        "whereClauseElements": ["condition1", "condition2"]
      }
    ]
  }
}
```

### POST /api/disconnect/:connectionId
Disconnect from database

## Network Graph Legend

| Color | Node Type |
|-------|-----------|
| Dark Gray | Stored Procedure |
| Blue | INSERT Statement |
| Orange | UPDATE Statement |
| Red | DELETE Statement |
| Green | Table |
| Purple | Column |
| Yellow | WHERE Clause |

## Customization

### Modify Network Layout

Edit `app.js` to change vis.js options:

```javascript
const options = {
    physics: {
        barnesHut: {
            gravitationalConstant: -2000,  // Adjust repulsion
            springLength: 150               // Adjust edge length
        }
    }
};
```

### Change Node Colors

Modify the `colors` object in `visualizeStatements()`:

```javascript
const colors = {
    INSERT: '#3498db',
    UPDATE: '#e67e22',
    DELETE: '#e74c3c',
    table: '#2ecc71',
    column: '#9b59b6',
    where: '#f39c12'
};
```

## Troubleshooting

### Connection Fails

- **Check database credentials**: Ensure username/password are correct
- **Verify network access**: Database must be accessible from the server
- **Check firewall**: Ensure database port is open
- **SQL Server**: Enable TCP/IP and SQL Server Authentication

### Parser Errors

- **Build the C# project**: Run `dotnet build` in the parent directory
- **Check .NET installation**: Ensure .NET 8.0 SDK is installed
- **Verify path**: The server looks for the parser at `../bin/Debug/net8.0/SQLParser`

### Visualization Issues

- **Empty graph**: Check browser console for JavaScript errors
- **Performance**: Large procedures with many nodes may be slow
- **Layout**: Try adjusting physics settings or use hierarchical layout

## Security Notes

⚠️ **This is a development tool. Do not expose to the internet without:**

1. Adding authentication/authorization
2. Implementing proper input validation
3. Using environment variables for sensitive data
4. Adding rate limiting
5. Implementing HTTPS
6. Sanitizing user inputs

## Dependencies

### Backend
- express: Web server framework
- mssql: SQL Server client
- mysql2: MySQL client
- cors: Cross-origin resource sharing
- body-parser: Request body parsing

### Frontend
- vis-network: Network visualization library

## License

Same as parent project

## Contributing

Contributions welcome! Please test thoroughly with both SQL Server and MySQL.
