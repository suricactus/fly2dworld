.mode csv
.import ./airports.csv airports
.import ./countries.csv countries
.import ./capitals.csv capitals

-- countries with airports
CREATE VIEW cwa AS
SELECT
  type,
  iso_country as code
FROM airports
WHERE type LIKE '%_airport'
GROUP BY 1, 2;

-- all these views are for the sake of simplicity

-- countries with small airports
CREATE VIEW cwa_s AS
SELECT * FROM cwa WHERE type = 'small_airport';

-- countries with medium airports
CREATE VIEW cwa_m AS
SELECT * FROM cwa WHERE type = 'medium_airport';

-- countries with large airports
CREATE VIEW cwa_l AS
SELECT * FROM cwa WHERE type = 'large_airport';

-- countries with medium or large airports
CREATE VIEW cwa_ml AS
SELECT type, code
FROM cwa
WHERE 0
  OR type = 'medium_airport'
  OR type = 'large_airport'
GROUP BY 1, 2;

-- countries without large airports
CREATE VIEW cwa_not_l AS
SELECT code, MIN(type) AS type
FROM (
  SELECT cwa_s.code, cwa_s.type
  FROM cwa_s
  LEFT JOIN cwa_ml ON cwa_s.code = cwa_ml.code
  WHERE cwa_ml.code IS NULL
  UNION
  SELECT cwa_m.code, cwa_m.type
  FROM cwa_m
  LEFT JOIN cwa_l ON cwa_m.code = cwa_l.code
  WHERE cwa_l.code IS NULL
) cwa_multi
GROUP BY 1;

-- airports of countries without large airports
CREATE VIEW airports_without_l as
SELECT airports.*, cwa_not_l.code FROM cwa_not_l
JOIN airports ON cwa_not_l.code = airports.iso_country AND cwa_not_l.type = airports.type;