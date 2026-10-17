import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { ageOn, formatDate, yearCell } from './era.js';
import { sortHistory, sortLicenses } from './resume-repo.js';

const MIN_HISTORY_ROWS = 10; // 用紙らしく見えるように、行が少なくても空行で埋める
const MIN_LICENSE_ROWS = 5;

/**
 * 履歴書の表示（JIS 規格の履歴書に近いレイアウト）。
 * @returns {() => void}
 */
export function mountResumeView(root, { repo, go }) {
  let mode = repo.pref('era', 'seireki'); // 'seireki' | 'wareki'

  const container = h('div', { class: 'resume' });

  const blank = (text, placeholder = '未入力') => text || h('span', { class: 'paper-blank' }, placeholder);

  function paper(r) {
    const age = ageOn(r.birthDate, r.updatedOn);

    // ---------- 学歴・職歴の表 ----------
    const historyRows = [];
    const history = sortHistory(r.history);
    const education = history.filter((row) => row.kind === '学歴');
    const work = history.filter((row) => row.kind === '職歴');

    const headingRow = (label) => h('tr', { class: 'row-heading' }, h('td'), h('td'), h('td', {}, label));
    const entryRow = (row, text) => h('tr', {},
      h('td', { class: 'c-year' }, yearCell(row.year, row.month, mode)),
      h('td', { class: 'c-month' }, row.month),
      h('td', {}, text),
    );
    const emptyRow = () => h('tr', { class: 'row-empty' }, h('td'), h('td'), h('td'));

    if (history.length > 0) {
      historyRows.push(headingRow('学　歴'), ...education.map((row) => entryRow(row, row.text)));
      historyRows.push(headingRow('職　歴'));
      historyRows.push(...(work.length ? work.map((row) => entryRow(row, row.text)) : [h('tr', {}, h('td'), h('td'), h('td', {}, 'なし'))]));
      historyRows.push(h('tr', { class: 'row-end' }, h('td'), h('td'), h('td', {}, '以上')));
    }
    while (historyRows.length < MIN_HISTORY_ROWS) historyRows.push(emptyRow());

    // ---------- 資格・免許の表 ----------
    const licenseRows = sortLicenses(r.licenses).map((row) => h('tr', {},
      h('td', { class: 'c-year' }, yearCell(row.year, row.month, mode)),
      h('td', { class: 'c-month' }, row.month),
      h('td', {}, h('span', { class: 'kind-tag' }, row.kind), row.name),
    ));
    while (licenseRows.length < MIN_LICENSE_ROWS) licenseRows.push(emptyRow());

    const table = (label, rows, caption) => h('table', { class: 'paper-table' },
      h('caption', { class: 'visually-hidden' }, caption),
      h('colgroup', {}, h('col', { class: 'col-year' }), h('col', { class: 'col-month' }), h('col')),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, '年'), h('th', { scope: 'col' }, '月'), h('th', { scope: 'col' }, label))),
      h('tbody', {}, rows),
    );

    return h('article', { class: 'paper', 'aria-label': '履歴書' },
      h('div', { class: 'paper-top' },
        h('div', { class: 'paper-main' },
          h('div', { class: 'paper-head' },
            h('h2', { class: 'paper-title' }, '履 歴 書'),
            h('p', { class: 'paper-date' }, `${formatDate(r.updatedOn, mode)}現在`),
          ),
          h('div', { class: 'paper-box' },
            h('div', { class: 'cell cell-kana' },
              h('span', { class: 'cell-label' }, 'ふりがな'),
              h('span', { class: 'cell-value' }, r.nameKana),
            ),
            h('div', { class: 'cell cell-name' },
              h('span', { class: 'cell-label' }, '氏　名'),
              h('span', { class: 'cell-value name-value' }, blank(r.name)),
            ),
            h('div', { class: 'cell cell-birth' },
              h('span', { class: 'cell-label' }, '生年月日'),
              h('span', { class: 'cell-value' },
                r.birthDate ? `${formatDate(r.birthDate, mode)}生` : blank(''),
                age != null && h('span', { class: 'age' }, `（満 ${age} 歳）`)),
            ),
          ),
        ),
        h('figure', { class: 'photo-box' },
          r.photo
            ? h('img', { src: r.photo, alt: `${r.name || '本人'}の顔写真` })
            : h('figcaption', { class: 'photo-empty' },
              h('span', {}, '写真をはる位置'),
              h('small', {}, '縦 36〜40mm'), h('small', {}, '横 24〜30mm')),
        ),
      ),

      h('div', { class: 'paper-box addr-block' },
        h('div', { class: 'addr-main' },
          h('div', { class: 'cell cell-kana' },
            h('span', { class: 'cell-label' }, 'ふりがな'),
            h('span', { class: 'cell-value' }, r.addressKana),
          ),
          h('div', { class: 'cell cell-address' },
            h('span', { class: 'cell-label' }, '現住所'),
            h('span', { class: 'cell-value' },
              h('span', { class: 'postal' }, `〒 ${r.postalCode || '　　　-　　　　'}`),
              h('span', { class: 'address-text' }, blank(r.address))),
          ),
        ),
        h('div', { class: 'addr-phones' },
          h('div', { class: 'cell cell-phone' },
            h('span', { class: 'cell-label' }, '電話'),
            h('span', { class: 'cell-value tel' }, r.phone || '―'),
          ),
          h('div', { class: 'cell cell-phone' },
            h('span', { class: 'cell-label' }, '携帯電話'),
            h('span', { class: 'cell-value tel' }, r.mobile || '―'),
          ),
        ),
      ),

      table('学歴・職歴（各別にまとめて書く）', historyRows, '学歴・職歴'),
      table('免許・資格', licenseRows, '免許・資格'),
    );
  }

  function render() {
    const r = repo.get();
    const empty = !repo.hasData();

    // replaceChildren は false を文字にしてしまうので filter で除く
    container.replaceChildren(...[
      h('div', { class: 'resume-tools' },
        h('div', { class: 'segmented', role: 'group', 'aria-label': '年の表記' },
          [['seireki', '西暦'], ['wareki', '和暦']].map(([value, label]) => h('button', {
            type: 'button',
            'aria-pressed': String(mode === value),
            onClick: () => { mode = value; repo.setPref('era', value); render(); },
          }, label))),
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => go('resume/edit') },
          icon('pencil'), empty ? '履歴書を作る' : '編集'),
      ),
      r.isSample && h('p', { class: 'notice' }, icon('alert'), 'これはお試し用のサンプルです。「編集」から自分の情報に書き換えられます。'),
      empty && h('p', { class: 'notice' }, icon('doc'), 'まだ何も入力されていません。「履歴書を作る」から入力すると、この用紙に反映されます。'),
      h('div', { class: 'paper-scroll' }, paper(r)),
    ].filter(Boolean));
  }

  root.append(container);
  render();
  return repo.subscribe(render);
}
