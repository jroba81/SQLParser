using System;
using System.IO;
using System.Linq;

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
                Console.WriteLine("  SQLParser <sql-file-path>       - Parse a SQL file");
                Console.WriteLine("  SQLParser --example             - Run with example stored procedures");
                Console.WriteLine("  SQLParser --csv <sql-file-path> - Output as CSV format");
                Console.WriteLine();
                return;
            }

            var parser = new StoredProcedureParser();
            bool csvFormat = args.Contains("--csv");
            string? filePath = null;

            if (args[0] == "--example")
            {
                RunExamples(parser, csvFormat);
                return;
            }

            if (csvFormat && args.Length > 1)
            {
                filePath = args[1];
            }
            else if (!csvFormat)
            {
                filePath = args[0];
            }

            if (string.IsNullOrEmpty(filePath))
            {
                Console.WriteLine("Error: No file path specified");
                return;
            }

            ParseFile(parser, filePath, csvFormat);
        }

        static void ParseFile(StoredProcedureParser parser, string filePath, bool csvFormat)
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

                if (csvFormat)
                {
                    Console.WriteLine(TableFormatter.FormatAsCSV(statements));
                }
                else
                {
                    Console.WriteLine(TableFormatter.FormatAsTable(statements));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
        }

        static void RunExamples(StoredProcedureParser parser, bool csvFormat)
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

            if (csvFormat)
            {
                Console.WriteLine(TableFormatter.FormatAsCSV(statements));
            }
            else
            {
                Console.WriteLine(TableFormatter.FormatAsTable(statements));
            }
        }
    }
}
