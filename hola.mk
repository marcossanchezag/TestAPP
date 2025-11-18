use ejemplo;

-- Genera la definicion de tablas en SQL.
CREATE TABLE Libro (
  ISBN VARCHAR(20) PRIMARY KEY,
  Editorial VARCHAR(50),
  titulo VARCHAR(20),
  num_paginas INT
);

CREATE TABLE socio(
  dni VARCHAR(9) PRIMARY KEY,
  nombre VARCHAR(20),
  provincia varchar(20),
  fecha_nacimiento date,
  
  -- El socio debe ser mayor de edad 
  CONSTRAINT CHK_Socio_Edad CHECK (fecha_nacimiento <= DATE '1991-11-10'),
  
  -- La provincia debe ser ALmeria, cordoba, Málaga o Granada
  CONSTRAINT CHK_PROVINCIA CHECK (PROVINCIA IN ("Almeria","Cordoba", "Malaga", "Granada"))
);

CREATE TABLE Prestam (
  ISBN_libro VARCHAR(20),
  DNI_socio    VARCHAR(9),
  fecha_prestamo DATE,
  fecha_devolucion DATE,
  devuelto varchar(20),
  titulo VARCHAR(20),
  
  -- Los valores de devuelto solo pueden ser S o N
  CONSTRAINT chk_devuelto CHECK (devuelto IN ('S','N')),
  CONSTRAINT PK_Prestamo PRIMARY KEY (ISBN_libro, DNI_socio, fecha_prestamo),
  CONSTRAINT FK_prestamo_LIBRO foreign key (ISBN_libro) references Libro(ISBN),
  CONSTRAINT FK_prestamo_SOCIO foreign key (DNI_socio) references socio(dni)
);

-- Crea una Vista denominada PRESTADOS, en contenga el título del libro, nombre de socio, fecha de prestamo y fecha de devolución.
CREATE VIEW prestados AS
SELECT
    L.titulo,
    S.nombre AS nombre_socio,
    P.fecha_prestamo,
    P.fecha_devolucion
FROM
    Prestam P
INNER JOIN
    Libro L ON P.ISBN_libro = L.ISBN  -- Une Prestam con Libro
INNER JOIN
    socio S ON P.DNI_socio = S.dni;  -- Une Prestam con socio
    
-- . Añade a la tabla SOCIO una columna denominada localidad del tipo varchar2(30).
ALTER TABLE socio ADD COLUMN localidad varchar(30);

-- . Crea la tabla PROVINCIAS con la siguiente columna: nombre_provincia del tipo varchar2(30)
CREATE TABLE PROVINCIAS(nombre_provincia varchar(30));

-- . Anade la restriccion de clave primaria a la columna nombre_provincia de la tabla PROVINCIAS
ALTER TABLE PROVINCIAS ADD CONSTRAINT primary_key_nombre_p PRIMARY KEY (nombre_provincia);

-- Anade la restriccion de clave ajena de la columna provincia de la tabla SOCIOS, a la columna nombre_provincia de la tabla PROVINCIAS.
ALTER TABLE socio ADD CONSTRAINT foreignkey_provicia FOREIGN KEY (provincia) REFERENCES PROVINCIAS(nombre_provincia);