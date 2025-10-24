using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace SQLParser
{
    /// <summary>
    /// Formats parsed statements into a readable table format
    /// </summary>
    public class TableFormatter
    {
        /// <summary>
        /// Format parsed statements as a table with 3 columns:
        /// 1. Columns (in UPDATE/INSERT/DELETE)
        /// 2. Tables (FROM/JOIN)
        /// 3. WHERE Clause Elements
        /// </summary>
        public static string FormatAsTable(List<ParsedStatement> statements)
        {
            if (statements.Count == 0)
            {
                return "No DML statements found.";
            }

            var sb = new StringBuilder();

            // Calculate column widths
            int colWidth1 = Math.Max("COLUMNS".Length, statements.Max(s => FormatList(s.Columns).Length));
            int colWidth2 = Math.Max("TABLES".Length, statements.Max(s => FormatList(s.Tables).Length));
            int colWidth3 = Math.Max("WHERE CLAUSE".Length, statements.Max(s => FormatList(s.WhereClauseElements).Length));

            // Ensure minimum width for readability
            colWidth1 = Math.Max(colWidth1, 20);
            colWidth2 = Math.Max(colWidth2, 20);
            colWidth3 = Math.Max(colWidth3, 30);

            // Create header
            sb.AppendLine();
            sb.AppendLine(new string('=', colWidth1 + colWidth2 + colWidth3 + 10));
            sb.AppendLine($"| {"COLUMNS".PadRight(colWidth1)} | {"TABLES".PadRight(colWidth2)} | {"WHERE CLAUSE".PadRight(colWidth3)} |");
            sb.AppendLine(new string('=', colWidth1 + colWidth2 + colWidth3 + 10));

            // Add rows
            foreach (var statement in statements)
            {
                var columns = SplitIntoLines(FormatList(statement.Columns), colWidth1);
                var tables = SplitIntoLines(FormatList(statement.Tables), colWidth2);
                var whereElements = SplitIntoLines(FormatList(statement.WhereClauseElements), colWidth3);

                int maxRows = Math.Max(Math.Max(columns.Count, tables.Count), whereElements.Count);

                // Add statement type header
                sb.AppendLine($"| {$"[{statement.StatementType} - Line {statement.LineNumber}]".PadRight(colWidth1 + colWidth2 + colWidth3 + 6)} |");
                sb.AppendLine(new string('-', colWidth1 + colWidth2 + colWidth3 + 10));

                // Print all rows for this statement
                for (int i = 0; i < maxRows; i++)
                {
                    var col = i < columns.Count ? columns[i].PadRight(colWidth1) : new string(' ', colWidth1);
                    var tbl = i < tables.Count ? tables[i].PadRight(colWidth2) : new string(' ', colWidth2);
                    var whr = i < whereElements.Count ? whereElements[i].PadRight(colWidth3) : new string(' ', colWidth3);

                    sb.AppendLine($"| {col} | {tbl} | {whr} |");
                }

                sb.AppendLine(new string('-', colWidth1 + colWidth2 + colWidth3 + 10));
            }

            sb.AppendLine(new string('=', colWidth1 + colWidth2 + colWidth3 + 10));
            sb.AppendLine();

            return sb.ToString();
        }

        /// <summary>
        /// Format parsed statements as CSV
        /// </summary>
        public static string FormatAsCSV(List<ParsedStatement> statements)
        {
            var sb = new StringBuilder();
            sb.AppendLine("StatementType,Line,Columns,Tables,WhereClause");

            foreach (var statement in statements)
            {
                sb.AppendLine($"\"{statement.StatementType}\",{statement.LineNumber}," +
                             $"\"{EscapeCSV(FormatList(statement.Columns))}\","+
                             $"\"{EscapeCSV(FormatList(statement.Tables))}\","+
                             $"\"{EscapeCSV(FormatList(statement.WhereClauseElements))}\"");
            }

            return sb.ToString();
        }

        private static string FormatList(List<string> items)
        {
            if (items.Count == 0)
                return "(none)";

            return string.Join(", ", items.Distinct());
        }

        private static List<string> SplitIntoLines(string text, int maxWidth)
        {
            var lines = new List<string>();

            if (text.Length <= maxWidth)
            {
                lines.Add(text);
                return lines;
            }

            // Split by comma first
            var parts = text.Split(new[] { ", " }, StringSplitOptions.None);
            var currentLine = "";

            foreach (var part in parts)
            {
                if (string.IsNullOrEmpty(currentLine))
                {
                    currentLine = part;
                }
                else if ((currentLine + ", " + part).Length <= maxWidth)
                {
                    currentLine += ", " + part;
                }
                else
                {
                    lines.Add(currentLine);
                    currentLine = part;
                }
            }

            if (!string.IsNullOrEmpty(currentLine))
            {
                lines.Add(currentLine);
            }

            return lines;
        }

        private static string EscapeCSV(string value)
        {
            return value.Replace("\"", "\"\"");
        }
    }
}
