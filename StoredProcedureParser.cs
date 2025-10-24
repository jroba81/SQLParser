using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace SQLParser
{
    /// <summary>
    /// Main parser class for analyzing SQL Server stored procedures
    /// </summary>
    public class StoredProcedureParser
    {
        private readonly TSql160Parser _parser;

        public StoredProcedureParser()
        {
            _parser = new TSql160Parser(initialQuotedIdentifiers: true);
        }

        /// <summary>
        /// Parse a stored procedure and extract DML statement details
        /// </summary>
        /// <param name="sqlText">The SQL text containing the stored procedure</param>
        /// <returns>List of parsed DML statements</returns>
        public (List<ParsedStatement> Statements, List<ParseError> Errors) ParseStoredProcedure(string sqlText)
        {
            using var reader = new StringReader(sqlText);

            // Parse the SQL text into an AST
            TSqlFragment fragment = _parser.Parse(reader, out IList<ParseError> errors);

            if (errors.Count > 0)
            {
                return (new List<ParsedStatement>(), new List<ParseError>(errors));
            }

            // Use the visitor to traverse the AST and extract statement details
            var visitor = new StatementAnalysisVisitor();
            fragment.Accept(visitor);

            return (visitor.ParsedStatements, new List<ParseError>());
        }

        /// <summary>
        /// Parse a stored procedure from a file
        /// </summary>
        /// <param name="filePath">Path to the SQL file</param>
        /// <returns>List of parsed DML statements</returns>
        public (List<ParsedStatement> Statements, List<ParseError> Errors) ParseStoredProcedureFromFile(string filePath)
        {
            if (!File.Exists(filePath))
            {
                throw new FileNotFoundException($"SQL file not found: {filePath}");
            }

            string sqlText = File.ReadAllText(filePath);
            return ParseStoredProcedure(sqlText);
        }
    }
}
