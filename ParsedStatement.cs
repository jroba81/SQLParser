using System;
using System.Collections.Generic;

namespace SQLParser
{
    /// <summary>
    /// Represents a parsed DML statement with its columns, tables, and WHERE clause elements
    /// </summary>
    public class ParsedStatement
    {
        public string StatementType { get; set; } = string.Empty;
        public List<string> Columns { get; set; } = new List<string>();
        public List<string> Tables { get; set; } = new List<string>();
        public List<string> WhereClauseElements { get; set; } = new List<string>();
        public int LineNumber { get; set; }

        public override string ToString()
        {
            return $"{StatementType} at line {LineNumber}";
        }
    }
}
