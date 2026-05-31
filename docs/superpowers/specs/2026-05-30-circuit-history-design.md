# Circuit Historical Results — Year Picker Design

**Date:** 2026-05-30  
**Status:** Approved

## Summary

Add a year picker pill/dropdown to the `CircuitDetailsModal` right-side results card, allowing users to browse race results for any season since the circuit's last major redesign.

---

## Scope

Extend the existing circuit details flow. No new modal, no new route. The year picker lives inside the results card that already occupies the right column of `CircuitDetailsModal`.

---

## Backend

### Endpoint change: `GET /api/circuit/{circuit_id}`

Add optional query param `season: int = 2026`.

- Uses `season - 1` for the results fetch (only completed seasons shown).
- Returns the same shape as today; `prev_results` and `stats` reflect the requested season.

### Circuit redesign year map

Add a static dict `CIRCUIT_REDESIGN_YEAR` in `main.py`:

```python
CIRCUIT_REDESIGN_YEAR = {
    "silverstone": 2010,
    "spa": 2007,
    "monza": 2000,
    "monaco": 1929,   # unchanged — use 10-yr default
    "bahrain": 2004,
    "jeddah": 2021,
    "albert_park": 2022,
    "suzuka": 1987,
    "shanghai": 2004,
    "miami": 2022,
    "imola": 1988,
    "catalunya": 1991,
    "villeneuve": 1978,
    "red_bull_ring": 2011,
    "hungaroring": 1986,
    "zandvoort": 2021,
    "marina_bay": 2008,
    "americas": 2012,
    "rodriguez": 1962,
    "interlagos": 1984,
    "las_vegas": 2023,
    "losail": 2021,
    "yas_marina": 2009,
    "baku": 2016,
}
DEFAULT_HISTORY_WINDOW = 10
```

The available year range returned in the response:  
`start_year = CIRCUIT_REDESIGN_YEAR.get(circuit_id, current_season - DEFAULT_HISTORY_WINDOW)`  
`years = list(range(start_year, current_season))`  — only completed seasons.

Add `available_years: list[int]` to the response payload so the frontend doesn't need to compute this.

---

## Frontend

### Year picker component

Inside the right-side results card in `CircuitDetailsModal`:

- Replace the hardcoded `{prevYear} Race Results` heading with a compact pill-style `<select>` (or `<button>` row if ≤ 6 years).
- Style: `text-[10px] font-black uppercase` pill, `bg-white/10` inactive, `bg-mkbhd-red text-white` active — matching the existing badge style in the modal.
- Default selection: most recent completed season (`available_years[available_years.length - 1]`).

### State additions to `CircuitDetailsModal`

```ts
const [selectedYear, setSelectedYear] = useState<number | null>(null);
const [yearResults, setYearResults] = useState<any[]>([]);
const [yearLoading, setYearLoading] = useState(false);
```

On `data` load (initial fetch), set `selectedYear` to the last entry in `data.available_years` and populate `yearResults` from `data.prev_results`.

On year change: fire `axios.get(\`${API_BASE}/circuit/${circuit.circuitId}?season=\${selectedYear + 1}\`)`, update only `yearResults` (not the full `data`). Show an inline spinner on the results list only — the rest of the modal stays visible.

### Results list

No structural change — same `P{n} / familyName / Constructor` row layout. Only the data source changes to `yearResults`.

---

## Error handling

- Year fetch failure: show `"NO DATA"` in the results list, leave year pill selected so user can retry.
- `available_years` empty: hide the year picker, show static "No historical data" text.

---

## Out of scope

- Sprint results, qualifying, practice sessions (separate task in memory: "Race results modal").
- Caching year results on the frontend (YAGNI).
- Animations on year switch.
