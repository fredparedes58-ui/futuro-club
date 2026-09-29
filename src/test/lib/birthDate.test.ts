/**
 * toIsoBirthDate — proyección ÚNICA de la fecha de nacimiento del jugador
 * (data.birthDate) a la columna players.birth_date (control RGPD, 036).
 * La migración 071 replica esta regla; ver 071_birth_date_backfill.test.ts.
 */
import { describe, it, expect } from "vitest";
import { toIsoBirthDate, localIsoDate, BIRTH_DATE_MIN_ISO } from "@/lib/shared/birthDate";

const NOW = new Date(2026, 8, 29, 12, 0, 0); // 29-sep-2026 (local)

describe("toIsoBirthDate", () => {
  it("acepta una fecha real pasada en YYYY-MM-DD y la devuelve tal cual", () => {
    expect(toIsoBirthDate("2015-05-10", NOW)).toBe("2015-05-10");
    expect(toIsoBirthDate("2012-02-29", NOW)).toBe("2012-02-29"); // bisiesto
    expect(toIsoBirthDate(BIRTH_DATE_MIN_ISO, NOW)).toBe("1900-01-01"); // cota inclusiva
    expect(toIsoBirthDate("2026-09-28", NOW)).toBe("2026-09-28"); // ayer
  });

  it("ausente o no-string ⇒ null (nunca una fecha por defecto)", () => {
    expect(toIsoBirthDate(undefined, NOW)).toBeNull();
    expect(toIsoBirthDate(null, NOW)).toBeNull();
    expect(toIsoBirthDate("", NOW)).toBeNull();
    expect(toIsoBirthDate(20150510, NOW)).toBeNull();
  });

  it("formato distinto de YYYY-MM-DD exacto ⇒ null (no se reinterpreta)", () => {
    for (const s of ["10/05/2015", "2015-5-10", "2015-05-10T00:00:00Z", " 2015-05-10", "2015-05-10 ", "２０１５-05-10"]) {
      expect(toIsoBirthDate(s, NOW)).toBeNull();
    }
  });

  it("fecha de calendario imposible ⇒ null", () => {
    for (const s of ["2014-02-30", "2013-02-29", "2015-13-01", "2015-00-10", "2015-04-31", "2015-05-00"]) {
      expect(toIsoBirthDate(s, NOW)).toBeNull();
    }
  });

  it("hoy o futuro ⇒ null (no es un nacimiento)", () => {
    expect(toIsoBirthDate("2026-09-29", NOW)).toBeNull();
    expect(toIsoBirthDate("2030-01-01", NOW)).toBeNull();
  });

  it("anterior a 1900 ⇒ null (un 0214 mal tecleado no convierte a un niño en adulto)", () => {
    expect(toIsoBirthDate("1899-12-31", NOW)).toBeNull();
    expect(toIsoBirthDate("0214-03-15", NOW)).toBeNull();
  });

  it("localIsoDate formatea con ceros a la izquierda", () => {
    expect(localIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
