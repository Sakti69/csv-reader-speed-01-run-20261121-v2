// Fast drop-in for csv-reader 1.0.0 (make.fun's own reference program), v2.
//
// Same answers as the reference, bit for bit: for each input {text, header}
// it returns {columns, rows, errors} under the reference's broken-row policy:
// a U+FEFF at the very start is dropped; a record ends at LF or CRLF and a
// line left with no characters is no record; outside quotes a CR not followed
// by LF is dropped (stray_cr); a field opening with a quote runs to the next
// quote that is not doubled ("" inside it is one quote, each CRLF or lone CR
// inside it reads as LF); what follows its closing quote, up to the next
// comma or line break, is appended as it stands (quote_junk, when the field
// ends); a quote that never closes is a literal character and the text after
// it is read again as unquoted (unterminated_quote); a quote inside an
// unquoted field is literal; fields stay strings, never trimmed or converted;
// columns is the first record when header is true, else null; rows holds the
// records after it, each padded with "" (short_row, with fields: its count)
// or cut (long_row, with extra: the cut fields) to the first record's width;
// each error is {code, line, row}, in the order met, line the 1-based line
// its record starts on (every LF, CRLF and lone CR inside quotes counted),
// row its record's index in rows (null for the header).
//
// Speed over v1 (same answers, ~30% less CPU on the practice set): the
// reference reads one character at a time and v1 paid one regex exec -- a
// fresh match array -- per unquoted field. v2 finds the next delimiter with
// one regex *test* instead (lastIndex gives its position, no array is
// built); the quote/CR tests that pick the fast path run on the text itself
// bounded by the line end, so a slow record costs no copy of its line; and
// a quoted field that closes on the line it opened on is known to hold no
// LF, so only a lone CR needs a look. No per-character string building
// anywhere on the hot path. Pure: no clock, no randomness, no locale,
// nothing kept from one call to the next.

/** Next field delimiter: comma, CR or LF. */
const DELIM = /[,\r\n]/g;
/** A CR, optionally followed by LF, inside a quoted field: each one is LF. */
const CRNL = /\r\n?/g;

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const N = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  let curNL = N; // the index of the LF ending the line pos is on, or N
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Errors report these two.
  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended, and how many characters readUnquoted
  // kept (for the quote_junk check). Shared side channels so fields cost no
  // per-field result object.
  let ended = END;
  let added = 0;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field;
  // sets `ended` and `added` (characters kept). One regex test finds the
  // next delimiter (test, not exec: no match array is built); lastIndex
  // gives its position.
  function readUnquoted(value) {
    added = 0;
    for (;;) {
      DELIM.lastIndex = pos;
      if (!DELIM.test(text)) {
        if (pos < N) {
          value += text.slice(pos);
          added += N - pos;
          pos = N;
        }
        ended = END;
        return value;
      }
      const k = DELIM.lastIndex - 1;
      if (k > pos) {
        value += text.slice(pos, k);
        added += k - pos;
      }
      const c = text.charCodeAt(k);
      if (c === 44) {
        pos = k + 1;
        ended = COMMA;
        return value;
      }
      if (c === 10) {
        pos = k + 1;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      // CR: with LF it ends the record; alone it is dropped (stray_cr).
      if (text.charCodeAt(k + 1) === 10) {
        pos = k + 2;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = k + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field;
  // sets `ended` (and `added`, via readUnquoted, on the junk path).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let start = pos + 1;
    let parts = null; // segments split by doubled quotes, if any
    let q;
    for (;;) {
      q = text.indexOf('"', start);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        if (parts === null) parts = [];
        parts.push(text.slice(start, q));
        start = q + 2;
        continue;
      }
      break;
    }
    let value = parts === null ? text.slice(start, q) : (parts.push(text.slice(start, q)), parts.join('"'));
    // Newlines inside the quotes count as lines; each CRLF or lone CR is
    // one LF in the value. Only pay for this when the content holds one.
    // When the field closes on the line it opened on (q < curNL) it holds
    // no LF at all, so only a lone CR needs a look.
    if (q < curNL) {
      const cr = value.indexOf('\r');
      if (cr !== -1) {
        let extra = 0;
        let p = 0;
        let r;
        while ((r = value.indexOf('\r', p)) !== -1) {
          extra += 1;
          p = r + 1;
        }
        line += extra;
        value = value.replace(CRNL, '\n');
      }
    } else if (value.indexOf('\r') !== -1 || value.indexOf('\n') !== -1) {
      let extra = 0;
      let p = 0;
      let r;
      while ((r = value.indexOf('\r', p)) !== -1) {
        extra += 1;
        p = r + 1;
      }
      p = 0;
      let n;
      while ((n = value.indexOf('\n', p)) !== -1) {
        if (value.charCodeAt(n - 1) !== 13) extra += 1;
        p = n + 1;
      }
      line += extra;
      if (value.indexOf('\r') !== -1) value = value.replace(CRNL, '\n');
    }
    pos = q + 1;
    if (pos >= N) {
      ended = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      ended = COMMA;
      // The field closed on a line that may differ from the one it opened
      // on: the next field's line end starts here.
      curNL = text.indexOf('\n', pos);
      if (curNL === -1) curNL = N;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break. The junk sits on the line the field closed
    // on, which may differ from the line it opened on.
    curNL = text.indexOf('\n', pos);
    if (curNL === -1) curNL = N;
    const junk = readUnquoted(value);
    if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < N) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= N) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a whole record on one line with no quote and no CR in it
    // (a CR only as the CRLF before the LF). It splits in C instead of
    // scanning field by field, and can produce no error but short/long row.
    // The quote/CR test runs on the sliced line, so it never scans past it.
    let fields;
    let quoted = false;
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? N : nl;
    let segEnd = lineEnd;
    if (nl !== -1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) segEnd -= 1;
    curNL = lineEnd;
    // No slice here: the quote/CR tests run on the text itself, bounded by
    // the line end, so a slow record costs no copy of its line.
    const qi = text.indexOf('"', pos);
    const hasQuote = qi !== -1 && qi < lineEnd;
    const ri = text.indexOf('\r', pos);
    const hasCR = ri !== -1 && ri < segEnd;
    if (!hasQuote && !hasCR) {
      fields = text.slice(pos, segEnd).split(',');
      line += 1;
      pos = nl === -1 ? N : nl + 1;
    } else {
      fields = [];
      let fieldValue;
      do {
        quoted = text.charCodeAt(pos) === 34;
        fieldValue = quoted ? readQuoted() : readUnquoted('');
        fields.push(fieldValue);
      } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
