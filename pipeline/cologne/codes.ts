/**
 * csl-orig dictionary id → our dict_sources code. Each one is registered by a migration (090 mw,
 * 091 the rest); adding a dictionary is a line here plus a migration.
 */
export const COLOGNE_CODES: Record<string, string> = {
  mw: "cologne_mw", // Monier-Williams 1899
  mw72: "cologne_mw72", // Monier-Williams 1872
  ap90: "cologne_ap90", // Apte 1890
  ap: "cologne_ap", // Apte 1957-59 (rights pending)
  md: "cologne_md", // Macdonell 1893
  ben: "cologne_ben", // Benfey 1866
  cae: "cologne_cae", // Cappeller 1891
  vei: "cologne_vei", // Vedic Index 1912
  pwg: "cologne_pwg", // Böhtlingk & Roth 1855-75
  gra: "cologne_gra", // Grassmann 1873
  vcp: "cologne_vcp", // Vācaspatyam 1873-84
  skd: "cologne_skd", // Śabdakalpadruma 1822-58
  shs: "cologne_shs", // Shabda-Sagara 1900
  bhs: "cologne_bhs", // Edgerton 1953 (rights pending)
};
