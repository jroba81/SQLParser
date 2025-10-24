-- Complex stored procedure with multiple joins and operations
CREATE PROCEDURE ProcessOrderBatch
    @BatchDate DATE,
    @WarehouseId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Update order status for ready orders
    UPDATE Orders
    SET
        OrderStatus = 'ReadyToShip',
        StatusDate = GETDATE(),
        WarehouseId = @WarehouseId
    FROM Orders o
    INNER JOIN OrderItems oi ON o.OrderId = oi.OrderId
    INNER JOIN Inventory i ON oi.ProductId = i.ProductId
    INNER JOIN Warehouses w ON i.WarehouseId = w.WarehouseId
    WHERE o.OrderDate = @BatchDate
        AND o.OrderStatus = 'Processing'
        AND w.WarehouseId = @WarehouseId
        AND i.Quantity >= oi.Quantity
        AND (o.Priority = 'High' OR o.CustomerType = 'Premium');

    -- Insert shipping records
    INSERT INTO ShippingQueue (OrderId, WarehouseId, QueueDate, Priority, EstimatedShipDate)
    SELECT
        o.OrderId,
        @WarehouseId,
        GETDATE(),
        CASE
            WHEN c.CustomerType = 'Premium' THEN 1
            WHEN o.Priority = 'High' THEN 2
            ELSE 3
        END,
        DATEADD(day, 2, GETDATE())
    FROM Orders o
    INNER JOIN Customers c ON o.CustomerId = c.CustomerId
    WHERE o.OrderStatus = 'ReadyToShip'
        AND o.WarehouseId = @WarehouseId
        AND NOT EXISTS (
            SELECT 1
            FROM ShippingQueue sq
            WHERE sq.OrderId = o.OrderId
        );

    -- Delete cancelled orders older than 30 days
    DELETE FROM Orders
    WHERE OrderStatus = 'Cancelled'
        AND OrderDate < DATEADD(day, -30, @BatchDate)
        AND WarehouseId = @WarehouseId;

    -- Update inventory after processing
    UPDATE Inventory
    SET
        Quantity = i.Quantity - oi.TotalQuantity,
        LastUpdated = GETDATE(),
        ReservedQuantity = i.ReservedQuantity + oi.TotalQuantity
    FROM Inventory i
    INNER JOIN (
        SELECT
            oi.ProductId,
            SUM(oi.Quantity) AS TotalQuantity
        FROM OrderItems oi
        INNER JOIN Orders o ON oi.OrderId = o.OrderId
        WHERE o.OrderStatus = 'ReadyToShip'
            AND o.WarehouseId = @WarehouseId
        GROUP BY oi.ProductId
    ) oi ON i.ProductId = oi.ProductId
    WHERE i.WarehouseId = @WarehouseId
        AND i.Quantity >= oi.TotalQuantity;

    -- Insert audit trail
    INSERT INTO OrderAudit (OrderId, Action, ActionDate, UserId, WarehouseId)
    SELECT
        o.OrderId,
        'BatchProcessed',
        GETDATE(),
        SYSTEM_USER,
        @WarehouseId
    FROM Orders o
    WHERE o.OrderDate = @BatchDate
        AND o.WarehouseId = @WarehouseId
        AND o.OrderStatus IN ('ReadyToShip', 'Processing');
END
