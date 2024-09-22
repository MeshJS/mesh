CREATE TABLE MapObjects (
  id VARCHAR(255) PRIMARY KEY, -- Utxo (Hash#Index) as a unique identifier
  class VARCHAR(50) NOT NULL, -- 'Ship', 'FuelPellet', 'RewardPot'
  positionX INT NOT NULL, -- X coordinate
  positionY INT NOT NULL, -- Y coordinate
  fuel INT, -- Fuel amount, only relevant for ships and fuel pellets
  shipyardPolicy VARCHAR(255), -- Policy ID relevant for all types
  shipTokenName VARCHAR(255), -- Only relevant for ships
  pilotTokenName VARCHAR(255), -- Only relevant for ships
  totalRewards INT -- Only relevant for the reward pot
);

-- Indexes for performance optimization
CREATE INDEX idx_mapobjects_class ON MapObjects(class);
CREATE INDEX idx_mapobjects_position ON MapObjects(positionX, positionY);
