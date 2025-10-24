-- Simple stored procedure example
CREATE PROCEDURE UpdateEmployeeSalary
    @EmployeeId INT,
    @NewSalary DECIMAL(10,2)
AS
BEGIN
    -- Update employee salary
    UPDATE Employees
    SET Salary = @NewSalary,
        LastModified = GETDATE()
    WHERE EmployeeId = @EmployeeId
        AND IsActive = 1;

    -- Log the change
    INSERT INTO SalaryHistory (EmployeeId, OldSalary, NewSalary, ChangeDate)
    SELECT
        @EmployeeId,
        e.Salary,
        @NewSalary,
        GETDATE()
    FROM Employees e
    WHERE e.EmployeeId = @EmployeeId;
END
