const { test } = require('node:test');
const assert = require('node:assert/strict');
const Papa = require('papaparse');
const { parseCSV } = require('../../browser');
test('CSV handles BOM, CRLF, quoted commas, multiline and escaped quotes with trailing metadata', () => {
    const parsed = parseCSV('\uFEFFid, Feedback ,source\r\n1,"Hello, ""team""\nsecond line",app\r\n2,Good,branch\r\n3, ,app\r\n\r\n', Papa);
    assert.deepEqual(parsed, { comments: [{ feedback: 'Hello, "team"\nsecond line', record: 2 }, { feedback: 'Good', record: 3 }], skipped: 1 });
});
test('CSV rejects empty files, missing/duplicate headers, no comments, malformed quotes and uneven rows', () => {
    for (const text of ['', 'id,text\n1,hello', 'feedback,Feedback\na,b', 'feedback\n', 'feedback,id\n"unclosed,1', 'feedback,id\nhello,1,extra', 'feedback,id\nhello']) assert.throws(() => parseCSV(text, Papa));
});
test('existing sample CSV files remain parseable', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    for (const file of ['Journey Mapping Demo 40.csv', 'Emerging Insights Sample.csv']) {
        assert.ok(parseCSV(fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'), Papa).comments.length > 0);
    }
});
