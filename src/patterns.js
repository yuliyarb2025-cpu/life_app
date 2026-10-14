export const PATTERNS = [
  {
    id: "glider",
    name: "Глайдер",
    rows: ["010", "001", "111"],
  },
  {
    id: "toad",
    name: "Жаба",
    rows: ["0111", "1110"],
  },
  {
    id: "pulsar",
    name: "Пульсар",
    rows: [
      "0011100011100",
      "0000000000000",
      "1000010100001",
      "1000010100001",
      "1000010100001",
      "0011100011100",
      "0000000000000",
      "0011100011100",
      "1000010100001",
      "1000010100001",
      "1000010100001",
      "0000000000000",
      "0011100011100",
    ],
  },
  {
    id: "lwss",
    name: "LWSS",
    rows: ["01001", "10000", "10001", "11110"],
  },
  {
    id: "gosper-gun",
    name: "Пушка Госпера",
    rows: [
      "000000000000000000000000100000000000",
      "000000000000000000000010100000000000",
      "000000000000110000001100000000000011",
      "000000000001000100001100000000000011",
      "110000000010000010001100000000000000",
      "110000000010001011000010100000000000",
      "000000000010000010000000100000000000",
      "000000000001000100000000000000000000",
      "000000000000110000000000000000000000",
    ],
  },
];

export function parsePattern(pattern) {
  const height = pattern.rows.length;
  let width = 0;
  for (const row of pattern.rows) {
    if (row.length > width) width = row.length;
  }
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const row = pattern.rows[y];
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === "1") cells.push([x, y]);
    }
  }
  return { id: pattern.id, name: pattern.name, width, height, cells };
}
