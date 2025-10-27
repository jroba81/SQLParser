using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.SqlServer.TransactSql.ScriptDom;

namespace SQLParser
{
    /// <summary>
    /// Visitor that traverses the SQL AST and extracts DML statement details
    /// </summary>
    public class StatementAnalysisVisitor : TSqlFragmentVisitor
    {
        public List<ParsedStatement> ParsedStatements { get; } = new List<ParsedStatement>();
        private ParsedStatement? _currentStatement;

        public override void Visit(InsertStatement node)
        {
            _currentStatement = new ParsedStatement
            {
                StatementType = "INSERT",
                LineNumber = node.StartLine
            };

            // Extract target table
            if (node.InsertSpecification?.Target is NamedTableReference tableRef)
            {
                _currentStatement.Tables.Add(GetTableName(tableRef.SchemaObject));
            }

            // Extract columns from INSERT column list
            if (node.InsertSpecification?.Columns != null)
            {
                foreach (var col in node.InsertSpecification.Columns)
                {
                    _currentStatement.Columns.Add(GetColumnName(col));
                }
            }

            // Extract columns from SELECT statement if INSERT...SELECT
            if (node.InsertSpecification?.InsertSource is SelectInsertSource selectSource)
            {
                // Extract SELECT columns (what's being selected to insert)
                ExtractSelectColumns(selectSource.Select);
                ExtractFromClause(selectSource.Select);
                ExtractWhereClause(selectSource.Select);
            }

            ParsedStatements.Add(_currentStatement);
            base.Visit(node);
        }

        public override void Visit(UpdateStatement node)
        {
            _currentStatement = new ParsedStatement
            {
                StatementType = "UPDATE",
                LineNumber = node.StartLine
            };

            // Extract target table
            if (node.UpdateSpecification?.Target is NamedTableReference tableRef)
            {
                _currentStatement.Tables.Add(GetTableName(tableRef.SchemaObject));
            }

            // Extract updated columns
            if (node.UpdateSpecification?.SetClauses != null)
            {
                foreach (var setClause in node.UpdateSpecification.SetClauses)
                {
                    if (setClause is AssignmentSetClause assignment)
                    {
                        _currentStatement.Columns.Add(GetColumnName(assignment.Column));
                    }
                }
            }

            // Extract FROM clause tables
            if (node.UpdateSpecification?.FromClause != null)
            {
                ExtractTablesFromTableReferences(node.UpdateSpecification.FromClause.TableReferences);
            }

            // Extract WHERE clause
            if (node.UpdateSpecification?.WhereClause != null)
            {
                ExtractWhereClauseElements(node.UpdateSpecification.WhereClause);
            }

            ParsedStatements.Add(_currentStatement);
            base.Visit(node);
        }

        public override void Visit(DeleteStatement node)
        {
            _currentStatement = new ParsedStatement
            {
                StatementType = "DELETE",
                LineNumber = node.StartLine
            };

            // Extract target table
            if (node.DeleteSpecification?.Target is NamedTableReference tableRef)
            {
                _currentStatement.Tables.Add(GetTableName(tableRef.SchemaObject));
            }

            // Extract FROM clause tables
            if (node.DeleteSpecification?.FromClause != null)
            {
                ExtractTablesFromTableReferences(node.DeleteSpecification.FromClause.TableReferences);
            }

            // Extract WHERE clause
            if (node.DeleteSpecification?.WhereClause != null)
            {
                ExtractWhereClauseElements(node.DeleteSpecification.WhereClause);
            }

            // Note: DELETE doesn't modify specific columns, so Columns list remains empty
            _currentStatement.Columns.Add("*"); // Indicate entire row deletion

            ParsedStatements.Add(_currentStatement);
            base.Visit(node);
        }

        private void ExtractFromClause(QueryExpression queryExpression)
        {
            if (queryExpression is QuerySpecification querySpec)
            {
                if (querySpec.FromClause != null)
                {
                    ExtractTablesFromTableReferences(querySpec.FromClause.TableReferences);
                }
            }
        }

        private void ExtractWhereClause(QueryExpression queryExpression)
        {
            if (queryExpression is QuerySpecification querySpec)
            {
                if (querySpec.WhereClause != null)
                {
                    ExtractWhereClauseElements(querySpec.WhereClause);
                }
            }
        }

        private void ExtractSelectColumns(QueryExpression queryExpression)
        {
            if (_currentStatement == null) return;

            if (queryExpression is QuerySpecification querySpec)
            {
                if (querySpec.SelectElements != null)
                {
                    foreach (var selectElement in querySpec.SelectElements)
                    {
                        if (selectElement is SelectScalarExpression scalarExpr)
                        {
                            // Get the column/expression being selected
                            string columnText = GetScalarExpressionText(scalarExpr.Expression);

                            // If there's an alias, show it
                            if (scalarExpr.ColumnName != null)
                            {
                                columnText = $"{columnText} AS {scalarExpr.ColumnName.Value}";
                            }

                            // Add to columns list with "SELECT:" prefix to distinguish from INSERT columns
                            if (!_currentStatement.Columns.Contains($"[SELECT] {columnText}"))
                            {
                                _currentStatement.Columns.Add($"[SELECT] {columnText}");
                            }
                        }
                        else if (selectElement is SelectStarExpression starExpr)
                        {
                            // Handle SELECT *
                            if (starExpr.Qualifier != null)
                            {
                                _currentStatement.Columns.Add($"[SELECT] {GetMultiPartIdentifierText(starExpr.Qualifier)}.*");
                            }
                            else
                            {
                                _currentStatement.Columns.Add("[SELECT] *");
                            }
                        }
                    }
                }
            }
        }

        private string GetMultiPartIdentifierText(MultiPartIdentifier identifier)
        {
            return string.Join(".", identifier.Identifiers.Select(i => i.Value));
        }

        private void ExtractTablesFromTableReferences(IList<TableReference> tableReferences)
        {
            if (_currentStatement == null) return;

            foreach (var tableRef in tableReferences)
            {
                if (tableRef is NamedTableReference namedTable)
                {
                    _currentStatement.Tables.Add(GetTableName(namedTable.SchemaObject));
                }
                else if (tableRef is QualifiedJoin join)
                {
                    // Recursively extract tables from JOINs
                    ExtractTablesFromJoin(join);
                }
            }
        }

        private void ExtractTablesFromJoin(QualifiedJoin join)
        {
            if (_currentStatement == null) return;

            // Extract left table
            if (join.FirstTableReference is NamedTableReference leftTable)
            {
                _currentStatement.Tables.Add(GetTableName(leftTable.SchemaObject));
            }
            else if (join.FirstTableReference is QualifiedJoin leftJoin)
            {
                ExtractTablesFromJoin(leftJoin);
            }

            // Extract right table
            if (join.SecondTableReference is NamedTableReference rightTable)
            {
                _currentStatement.Tables.Add(GetTableName(rightTable.SchemaObject));
            }
            else if (join.SecondTableReference is QualifiedJoin rightJoin)
            {
                ExtractTablesFromJoin(rightJoin);
            }

            // Extract JOIN condition (ON clause)
            if (join.SearchCondition != null)
            {
                var whereElements = ExtractBooleanExpression(join.SearchCondition);
                _currentStatement.WhereClauseElements.AddRange(whereElements);
            }
        }

        private void ExtractWhereClauseElements(WhereClause whereClause)
        {
            if (_currentStatement == null) return;

            var elements = ExtractBooleanExpression(whereClause.SearchCondition);
            _currentStatement.WhereClauseElements.AddRange(elements);
        }

        private List<string> ExtractBooleanExpression(BooleanExpression expression)
        {
            var elements = new List<string>();

            if (expression is BooleanBinaryExpression binaryExpr)
            {
                // Recursively extract left and right expressions
                elements.AddRange(ExtractBooleanExpression(binaryExpr.FirstExpression));
                elements.AddRange(ExtractBooleanExpression(binaryExpr.SecondExpression));
            }
            else if (expression is BooleanComparisonExpression comparisonExpr)
            {
                // Extract comparison like "col = value" or "t1.col = t2.col"
                var left = GetScalarExpressionText(comparisonExpr.FirstExpression);
                var right = GetScalarExpressionText(comparisonExpr.SecondExpression);
                var op = GetComparisonType(comparisonExpr.ComparisonType);
                elements.Add($"{left} {op} {right}");
            }
            else if (expression is BooleanParenthesisExpression parenExpr)
            {
                elements.AddRange(ExtractBooleanExpression(parenExpr.Expression));
            }
            else if (expression is InPredicate inPredicate)
            {
                var column = GetScalarExpressionText(inPredicate.Expression);
                var values = new List<string>();

                // Extract values from the IN clause
                if (inPredicate.Values != null)
                {
                    foreach (var value in inPredicate.Values)
                    {
                        values.Add(GetScalarExpressionText(value));
                    }
                }

                var notIn = inPredicate.NotDefined ? "NOT IN" : "IN";
                var valuesList = values.Count > 0 ? string.Join(", ", values) : "...";
                elements.Add($"{column} {notIn} ({valuesList})");
            }
            else if (expression is LikePredicate likePredicate)
            {
                var column = GetScalarExpressionText(likePredicate.FirstExpression);
                var pattern = GetScalarExpressionText(likePredicate.SecondExpression);
                elements.Add($"{column} LIKE {pattern}");
            }
            else if (expression is BooleanIsNullExpression isNullExpr)
            {
                var column = GetScalarExpressionText(isNullExpr.Expression);
                var nullOp = isNullExpr.IsNot ? "IS NOT NULL" : "IS NULL";
                elements.Add($"{column} {nullOp}");
            }
            else if (expression is ExistsPredicate existsPredicate)
            {
                elements.Add("EXISTS (subquery)");
            }
            else
            {
                // Fallback for other expression types
                elements.Add(expression.GetType().Name);
            }

            return elements;
        }

        private string GetScalarExpressionText(ScalarExpression expression)
        {
            if (expression is ColumnReferenceExpression colRef)
            {
                return GetColumnReferenceText(colRef);
            }
            else if (expression is Literal literal)
            {
                return literal.Value;
            }
            else if (expression is VariableReference varRef)
            {
                return varRef.Name;
            }
            else if (expression is FunctionCall funcCall)
            {
                return $"{funcCall.FunctionName.Value}(...)";
            }
            else if (expression is BinaryExpression binaryExpr)
            {
                var left = GetScalarExpressionText(binaryExpr.FirstExpression);
                var right = GetScalarExpressionText(binaryExpr.SecondExpression);
                var op = GetBinaryExpressionType(binaryExpr.BinaryExpressionType);
                return $"{left} {op} {right}";
            }
            else if (expression is ParenthesisExpression parenExpr)
            {
                return $"({GetScalarExpressionText(parenExpr.Expression)})";
            }

            return expression.GetType().Name;
        }

        private string GetColumnReferenceText(ColumnReferenceExpression colRef)
        {
            var parts = new List<string>();
            foreach (var identifier in colRef.MultiPartIdentifier.Identifiers)
            {
                parts.Add(identifier.Value);
            }
            return string.Join(".", parts);
        }

        private string GetTableName(SchemaObjectName schemaObject)
        {
            var parts = new List<string>();
            if (schemaObject.DatabaseIdentifier != null)
                parts.Add(schemaObject.DatabaseIdentifier.Value);
            if (schemaObject.SchemaIdentifier != null)
                parts.Add(schemaObject.SchemaIdentifier.Value);
            if (schemaObject.BaseIdentifier != null)
                parts.Add(schemaObject.BaseIdentifier.Value);

            return string.Join(".", parts);
        }

        private string GetColumnName(ColumnReferenceExpression column)
        {
            return string.Join(".", column.MultiPartIdentifier.Identifiers.Select(i => i.Value));
        }

        private string GetComparisonType(BooleanComparisonType comparisonType)
        {
            return comparisonType switch
            {
                BooleanComparisonType.Equals => "=",
                BooleanComparisonType.GreaterThan => ">",
                BooleanComparisonType.LessThan => "<",
                BooleanComparisonType.GreaterThanOrEqualTo => ">=",
                BooleanComparisonType.LessThanOrEqualTo => "<=",
                BooleanComparisonType.NotEqualToBrackets => "<>",
                BooleanComparisonType.NotEqualToExclamation => "!=",
                _ => comparisonType.ToString()
            };
        }

        private string GetBinaryExpressionType(BinaryExpressionType expressionType)
        {
            return expressionType switch
            {
                BinaryExpressionType.Add => "+",
                BinaryExpressionType.Subtract => "-",
                BinaryExpressionType.Multiply => "*",
                BinaryExpressionType.Divide => "/",
                BinaryExpressionType.Modulo => "%",
                _ => expressionType.ToString()
            };
        }
    }
}
