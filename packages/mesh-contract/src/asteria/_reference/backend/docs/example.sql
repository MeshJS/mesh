-- Insert the central RewardPot
INSERT INTO MapObjects (id, class, positionX, positionY, totalRewards)
VALUES ('rewardpot01', 'RewardPot', 0, 0, 1000.0);

-- Ships
INSERT INTO MapObjects (id, class, positionX, positionY, fuel, shipyardPolicy, shipTokenName, pilotTokenName)
VALUES ('ship01', 'Ship', 1, 0, 100, 'policy01', 'tokenName01', 'pilotName01'),
       ('ship02', 'Ship', -1, 0, 120, 'policy02', 'tokenName02', 'pilotName02'),
       ('ship03', 'Ship', 0, 1, 110, 'policy03', 'tokenName03', 'pilotName03'),
       ('ship04', 'Ship', 0, -1, 130, 'policy04', 'tokenName04', 'pilotName04'),
       ('ship05', 'Ship', 2, 1, 140, 'policy05', 'tokenName05', 'pilotName05'),
       ('ship06', 'Ship', -2, -1, 150, 'policy06', 'tokenName06', 'pilotName06');

-- FuelPellets
INSERT INTO MapObjects (id, class, positionX, positionY, fuel)
VALUES ('fuel01', 'FuelPellet', 1, 1, 50),
       ('fuel02', 'FuelPellet', 2, 0, 60),
       ('fuel03', 'FuelPellet', -1, 2, 70),
       ('fuel04', 'FuelPellet', -2, -2, 80),
       ('fuel05', 'FuelPellet', 3, -1, 90),
       ('fuel06', 'FuelPellet', -3, 1, 100);
