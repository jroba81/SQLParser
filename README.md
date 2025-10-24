# SQL Server Stored Procedure Parser

A C# tool that analyzes SQL Server stored procedures and breaks down DML statements (INSERT, UPDATE, DELETE) into a structured format showing:
- **Columns** involved in the statement
- **Tables** used in FROM or JOIN clauses
- **WHERE clause** elements

## Features

- Parses SQL Server T-SQL stored procedures using Microsoft's ScriptDom library
- Extracts detailed information from INSERT, UPDATE, and DELETE statements
- Identifies columns being modified or inserted
- Extracts all tables from FROM and JOIN clauses
- Parses WHERE clause conditions into readable elements
- Supports complex queries with multiple joins, subqueries, and nested conditions
- Output formats: formatted table or CSV

## Requirements

- .NET 6.0 or higher
- Microsoft.SqlServer.TransactSql.ScriptDom NuGet package (automatically restored)

## Building the Project

```bash
# Restore NuGet packages and build
dotnet restore
dotnet build

# Run the application
dotnet run -- <options>
```

## Usage

### Parse a SQL File

```bash
dotnet run -- /path/to/your/stored_procedure.sql
```

### Run with Built-in Examples

```bash
dotnet run -- --example
```

### Output as CSV

```bash
dotnet run -- --csv /path/to/your/stored_procedure.sql
```

### Command-Line Options

- `<sql-file-path>` - Path to a SQL file containing stored procedure(s)
- `--example` - Run with built-in example stored procedures
- `--csv <sql-file-path>` - Output results in CSV format

## Example Output

### Input SQL

```sql
CREATE PROCEDURE UpdateEmployeeSalary
    @EmployeeId INT,
    @NewSalary DECIMAL(10,2)
AS
BEGIN
    UPDATE Employees
    SET Salary = @NewSalary,
        LastModified = GETDATE()
    WHERE EmployeeId = @EmployeeId
        AND IsActive = 1;

    INSERT INTO SalaryHistory (EmployeeId, OldSalary, NewSalary, ChangeDate)
    SELECT @EmployeeId, e.Salary, @NewSalary, GETDATE()
    FROM Employees e
    WHERE e.EmployeeId = @EmployeeId;
END
```

### Output (Table Format)

```
=======================================================================
| COLUMNS              | TABLES               | WHERE CLAUSE            |
=======================================================================
| [UPDATE - Line 6]                                                   |
-----------------------------------------------------------------------
| Salary, LastModified | Employees            | EmployeeId = @EmployeeId|
|                      |                      | IsActive = 1            |
-----------------------------------------------------------------------
| [INSERT - Line 12]                                                  |
-----------------------------------------------------------------------
| EmployeeId,          | SalaryHistory,       | e.EmployeeId =          |
| OldSalary,           | Employees            | @EmployeeId             |
| NewSalary,           |                      |                         |
| ChangeDate           |                      |                         |
-----------------------------------------------------------------------
=======================================================================
```

### Output (CSV Format)

```csv
StatementType,Line,Columns,Tables,WhereClause
"UPDATE",6,"Salary, LastModified","Employees","EmployeeId = @EmployeeId, IsActive = 1"
"INSERT",12,"EmployeeId, OldSalary, NewSalary, ChangeDate","SalaryHistory, Employees","e.EmployeeId = @EmployeeId"
```

## Project Structure

```
SQLParser/
├── Program.cs                      # Main entry point
├── StoredProcedureParser.cs        # Main parser class
├── StatementAnalysisVisitor.cs     # AST visitor for extracting statement details
├── ParsedStatement.cs              # Model for parsed statement data
├── TableFormatter.cs               # Output formatting utilities
├── SQLParser.csproj                # Project file with dependencies
├── Examples/                       # Example SQL files
│   ├── SimpleExample.sql
│   └── ComplexExample.sql
└── README.md                       # This file
```

## How It Works

1. **Parsing**: Uses `TSql150Parser` from ScriptDom to parse T-SQL into an Abstract Syntax Tree (AST)
2. **Traversal**: Implements the Visitor pattern to traverse the AST and find DML statements
3. **Extraction**: Extracts specific elements:
   - **UPDATE**: SET clause columns, FROM/JOIN tables, WHERE conditions
   - **INSERT**: Column list, target table, SELECT tables (if INSERT...SELECT), WHERE conditions
   - **DELETE**: Target table, FROM clause tables, WHERE conditions
4. **Formatting**: Outputs results in a readable table or CSV format

## Supported SQL Constructs

### DML Statements
- UPDATE with SET clauses
- INSERT with explicit column lists
- INSERT...SELECT statements
- DELETE statements
- Multi-table FROM and JOIN clauses

### WHERE Clause Elements
- Comparison operators (=, <>, >, <, >=, <=)
- Boolean operators (AND, OR, NOT)
- IN predicates
- LIKE predicates
- IS NULL / IS NOT NULL
- EXISTS predicates
- Subqueries
- Complex nested conditions

### Join Types
- INNER JOIN
- LEFT/RIGHT/FULL OUTER JOIN
- CROSS JOIN
- Multiple levels of nested joins

## Limitations

- Focuses on DML statements (INSERT, UPDATE, DELETE) only
- Dynamic SQL is not parsed (only static T-SQL)
- Some very complex expressions may be simplified in output
- Requires valid T-SQL syntax (parse errors will be reported)

## Examples

See the `Examples/` directory for sample SQL files:
- `SimpleExample.sql` - Basic UPDATE and INSERT statements
- `ComplexExample.sql` - Advanced queries with multiple joins and subqueries

## Using Programmatically

You can also use the parser as a library in your own C# applications:

```csharp
using SQLParser;

var parser = new StoredProcedureParser();
var (statements, errors) = parser.ParseStoredProcedure(sqlText);

if (errors.Count == 0)
{
    foreach (var stmt in statements)
    {
        Console.WriteLine($"{stmt.StatementType} at line {stmt.LineNumber}");
        Console.WriteLine($"Columns: {string.Join(", ", stmt.Columns)}");
        Console.WriteLine($"Tables: {string.Join(", ", stmt.Tables)}");
        Console.WriteLine($"WHERE: {string.Join(", ", stmt.WhereClauseElements)}");
    }
}
```

## FAQ

### Q: Can this parse stored procedures directly from SQL Server?

A: This tool parses SQL text files. To analyze stored procedures from SQL Server, export them first:

```sql
-- Get stored procedure definition
SELECT m.definition
FROM sys.sql_modules m
JOIN sys.procedures p ON m.object_id = p.object_id
WHERE p.name = 'YourProcedureName';
```

Save the output to a .sql file and parse it with this tool.

### Q: Does it support other SQL dialects?

A: No, this tool specifically uses SQL Server's ScriptDom parser and only supports T-SQL syntax.

### Q: What about SELECT statements?

A: This tool focuses on data modification (INSERT, UPDATE, DELETE) statements. SELECT statements are parsed when they appear in INSERT...SELECT or UPDATE...FROM contexts.

## License

This project is provided as-is for educational and analytical purposes.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## References

- [Microsoft.SqlServer.TransactSql.ScriptDom Documentation](https://learn.microsoft.com/en-us/dotnet/api/microsoft.sqlserver.transactsql.scriptdom)
- [T-SQL Language Reference](https://learn.microsoft.com/en-us/sql/t-sql/language-reference)
