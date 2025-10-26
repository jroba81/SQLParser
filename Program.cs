using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SQLParser
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("SQL Server Stored Procedure Parser");
            Console.WriteLine("===================================\n");

            if (args.Length == 0)
            {
                Console.WriteLine("Usage:");
                Console.WriteLine("  SQLParser <sql-file-path>                          - Parse a SQL file (table output)");
                Console.WriteLine("  SQLParser <sql-file-path> --csv                    - Parse and display as CSV");
                Console.WriteLine("  SQLParser <sql-file-path> --csv -o output.csv      - Parse and save to CSV file");
                Console.WriteLine("  SQLParser <sql-file-path> --output results.txt     - Save table output to file");
                Console.WriteLine("  SQLParser --example                                - Run with example stored procedures");
                Console.WriteLine("  SQLParser --example --csv -o example.csv           - Run example and save CSV");
                Console.WriteLine();
                Console.WriteLine("Options:");
                Console.WriteLine("  --csv              Output in CSV format");
                Console.WriteLine("  --output, -o FILE  Write output to FILE instead of console");
                Console.WriteLine("  --example          Use built-in example stored procedure");
                Console.WriteLine();
                return;
            }

            var parser = new StoredProcedureParser();
            bool csvFormat = args.Contains("--csv");
            bool jsonFormat = args.Contains("--json");
            bool isExample = args.Contains("--example");
            bool stdinMode = args.Contains("--stdin");

            // Get output file path if specified
            string? outputFile = null;
            int outputIndex = Array.IndexOf(args, "--output");
            if (outputIndex == -1) outputIndex = Array.IndexOf(args, "-o");
            if (outputIndex >= 0 && outputIndex + 1 < args.Length)
            {
                outputFile = args[outputIndex + 1];
            }

            // Get file path by filtering out flags and their values
            var skipNext = false;
            string? filePath = null;
            for (int i = 0; i < args.Length; i++)
            {
                if (skipNext)
                {
                    skipNext = false;
                    continue;
                }

                if (args[i] == "--output" || args[i] == "-o")
                {
                    skipNext = true;
                    continue;
                }

                if (!args[i].StartsWith("--"))
                {
                    filePath = args[i];
                    break;
                }
            }

            // Handle stdin mode (for web server)
            if (stdinMode || jsonFormat)
            {
                string sqlText = Console.In.ReadToEnd();
                var (statements, errors) = parser.ParseStoredProcedure(sqlText);

                if (jsonFormat)
                {
                    OutputJson(statements, errors);
                }
                else
                {
                    // Regular output for stdin mode
                    if (csvFormat)
                    {
                        Console.WriteLine(TableFormatter.FormatAsCSV(statements));
                    }
                    else
                    {
                        Console.WriteLine(TableFormatter.FormatAsTable(statements));
                    }
                }
                return;
            }

            if (isExample)
            {
                RunExamples(parser, csvFormat, jsonFormat, outputFile);
                return;
            }

            if (string.IsNullOrEmpty(filePath))
            {
                Console.WriteLine("Error: No file path specified");
                return;
            }

            ParseFile(parser, filePath, csvFormat, jsonFormat, outputFile);
        }

        static void OutputJson(List<ParsedStatement> statements, List<Microsoft.SqlServer.TransactSql.ScriptDom.ParseError> errors)
        {
            var output = new
            {
                success = errors.Count == 0,
                errors = errors.Select(e => new
                {
                    line = e.Line,
                    column = e.Column,
                    message = e.Message
                }).ToList(),
                statements = statements.Select(s => new
                {
                    statementType = s.StatementType,
                    lineNumber = s.LineNumber,
                    columns = s.Columns,
                    tables = s.Tables,
                    whereClauseElements = s.WhereClauseElements
                }).ToList()
            };

            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };

            Console.WriteLine(JsonSerializer.Serialize(output, options));
        }

        static void ParseFile(StoredProcedureParser parser, string filePath, bool csvFormat, bool jsonFormat, string? outputFile)
        {
            try
            {
                if (!File.Exists(filePath))
                {
                    Console.WriteLine($"Error: File not found - {filePath}");
                    return;
                }

                Console.WriteLine($"Parsing: {filePath}\n");

                var (statements, errors) = parser.ParseStoredProcedureFromFile(filePath);

                if (errors.Count > 0)
                {
                    Console.WriteLine("Parse Errors:");
                    foreach (var error in errors)
                    {
                        Console.WriteLine($"  Line {error.Line}, Column {error.Column}: {error.Message}");
                    }
                    Console.WriteLine();
                }

                if (statements.Count == 0)
                {
                    Console.WriteLine("No DML statements (INSERT, UPDATE, DELETE) found in the file.");
                    return;
                }

                Console.WriteLine($"Found {statements.Count} DML statement(s):\n");

                if (jsonFormat)
                {
                    OutputJson(statements, errors);
                }
                else
                {
                    string output;
                    if (csvFormat)
                    {
                        output = TableFormatter.FormatAsCSV(statements);
                    }
                    else
                    {
                        output = TableFormatter.FormatAsTable(statements);
                    }

                    // Write to file or console
                    if (!string.IsNullOrEmpty(outputFile))
                    {
                        File.WriteAllText(outputFile, output);
                        Console.WriteLine($"Output written to: {Path.GetFullPath(outputFile)}");
                    }
                    else
                    {
                        Console.WriteLine(output);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
        }

        static void RunExamples(StoredProcedureParser parser, bool csvFormat, bool jsonFormat, string? outputFile)
        {
            string exampleSQL = @"
CREATE PROCEDURE UpdateCustomerOrders
    @CustomerId INT,
    @OrderStatus VARCHAR(20)
AS
BEGIN
    -- Update customer orders
    UPDATE Orders
    SET
        OrderStatus = @OrderStatus,
        LastModified = GETDATE(),
        ModifiedBy = SYSTEM_USER
    FROM Orders o
    INNER JOIN Customers c ON o.CustomerId = c.CustomerId
    WHERE c.CustomerId = @CustomerId
        AND o.OrderStatus <> 'Cancelled'
        AND o.OrderDate >= DATEADD(month, -6, GETDATE());

    -- Insert audit record
    INSERT INTO OrderAudit (OrderId, CustomerId, Action, ActionDate)
    SELECT
        o.OrderId,
        o.CustomerId,
        'StatusUpdate',
        GETDATE()
    FROM Orders o
    WHERE o.CustomerId = @CustomerId;

    -- Delete old pending orders
    DELETE FROM Orders
    WHERE CustomerId = @CustomerId
        AND OrderStatus = 'Pending'
        AND OrderDate < DATEADD(month, -12, GETDATE());

    -- Complex update with multiple joins
    UPDATE Inventory
    SET
        Quantity = i.Quantity - oi.Quantity,
        ReservedQuantity = i.ReservedQuantity + oi.Quantity
    FROM Inventory i
    INNER JOIN OrderItems oi ON i.ProductId = oi.ProductId
    INNER JOIN Orders o ON oi.OrderId = o.OrderId
    INNER JOIN Customers c ON o.CustomerId = c.CustomerId
    WHERE c.CustomerId = @CustomerId
        AND o.OrderStatus = @OrderStatus
        AND i.Quantity >= oi.Quantity
        AND (i.LocationId = c.DefaultLocationId OR c.DefaultLocationId IS NULL);
END";

            Console.WriteLine("Parsing example stored procedure...\n");

            var (statements, errors) = parser.ParseStoredProcedure(exampleSQL);

            if (errors.Count > 0)
            {
                Console.WriteLine("Parse Errors:");
                foreach (var error in errors)
                {
                    Console.WriteLine($"  Line {error.Line}, Column {error.Column}: {error.Message}");
                }
                Console.WriteLine();
            }

            Console.WriteLine($"Found {statements.Count} DML statement(s):\n");

            if (jsonFormat)
            {
                OutputJson(statements, errors);
            }
            else
            {
                string output;
                if (csvFormat)
                {
                    output = TableFormatter.FormatAsCSV(statements);
                }
                else
                {
                    output = TableFormatter.FormatAsTable(statements);
                }

                // Write to file or console
                if (!string.IsNullOrEmpty(outputFile))
                {
                    File.WriteAllText(outputFile, output);
                    Console.WriteLine($"Output written to: {Path.GetFullPath(outputFile)}");
                }
                else
                {
                    Console.WriteLine(output);
                }
            }
        }
    }
}
