import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet } from '../core/sheet.js';
import { showToast } from '../core/toast.js';
import { auth, NAME_MAX, PASSWORD_MIN } from '../core/auth.js';
import { deleteUserData, downloadBackup, readBackupFile, restoreUserData } from '../core/backup.js';
import { passwordInput } from './auth-parts.js';

const errorBox = () => h('p', { class: 'form-error', role: 'alert', hidden: true });
const showError = (box, message) => { box.replaceChildren(icon('alert'), h('span', {}, message)); box.hidden = false; };

/**
 * アカウント設定（表示名・パスワード・バックアップ・データの削除・アカウント削除）
 * @param {{ onNameChange?: (user) => void }} options
 */
export function openAccountSheet({ onNameChange } = {}) {
  const user = auth.user;
  const builtIn = auth.isBuiltIn();

  return openSheet({
    title: 'アカウント設定',
    render(sheet) {
      const sections = [];

      // ---------- 表示名 ----------
      const nameInput = h('input', { id: 'acc-name', class: 'text-input', type: 'text', maxlength: String(NAME_MAX), value: user.displayName, disabled: builtIn });
      const nameErr = errorBox();
      sections.push(h('form', {
        class: 'acc-section',
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          try {
            const updated = auth.updateDisplayName(nameInput.value);
            nameErr.hidden = true;
            onNameChange?.(updated);
            showToast('表示名を変更しました');
          } catch (err) { showError(nameErr, err.message); }
        },
      },
        h('h3', { class: 'sub-head' }, 'プロフィール'),
        h('p', { class: 'muted' }, `ユーザーID: ${user.id}`),
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'acc-name' }, '表示名'),
          h('div', { class: 'inline-row' }, nameInput, h('button', { type: 'submit', class: 'btn btn-ghost btn-sm', disabled: builtIn }, '変更')),
        ),
        nameErr,
        builtIn && h('p', { class: 'muted' }, 'お試し用のアカウントは、表示名・パスワードの変更と削除ができません。'),
      ));

      // ---------- パスワード ----------
      if (!builtIn) {
        const current = passwordInput({ id: 'acc-pw-current', autocomplete: 'current-password', placeholder: '今のパスワード', enterkeyhint: 'next' });
        const next = passwordInput({ id: 'acc-pw-new', autocomplete: 'new-password', placeholder: `${PASSWORD_MIN}文字以上`, enterkeyhint: 'next' });
        const confirm = passwordInput({ id: 'acc-pw-confirm', autocomplete: 'new-password', placeholder: 'もう一度', enterkeyhint: 'go' });
        const pwErr = errorBox();
        const submit = h('button', { type: 'submit', class: 'btn btn-ghost btn-sm' }, 'パスワードを変更');
        sections.push(h('form', {
          class: 'acc-section',
          novalidate: true,
          onSubmit: async (e) => {
            e.preventDefault();
            if (next.input.value !== confirm.input.value) { showError(pwErr, '新しいパスワードが一致しません。'); return; }
            submit.disabled = true;
            try {
              await auth.changePassword(current.input.value, next.input.value);
              pwErr.hidden = true;
              for (const f of [current, next, confirm]) f.input.value = '';
              showToast('パスワードを変更しました');
            } catch (err) { showError(pwErr, err.message); }
            finally { submit.disabled = false; }
          },
        },
          h('h3', { class: 'sub-head' }, 'パスワード'),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'acc-pw-current' }, '今のパスワード'), current.row),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'acc-pw-new' }, '新しいパスワード'), next.row),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'acc-pw-confirm' }, '新しいパスワード（確認）'), confirm.row),
          pwErr,
          h('div', {}, submit),
        ));
      }

      // ---------- バックアップ ----------
      const fileInput = h('input', { id: 'acc-restore-file', type: 'file', accept: 'application/json,.json', class: 'visually-hidden' });
      const restoreArea = h('div', { class: 'restore-area' });
      const backupErr = errorBox();
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        backupErr.hidden = true;
        try {
          const backup = await readBackupFile(file);
          const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) : '日時不明';
          restoreArea.replaceChildren(h('div', { class: 'label-confirm' },
            h('p', {},
              h('strong', {}, `${when} のバックアップを読み込みますか？`),
              h('span', {}, `今のデータはすべて置き換わります。${backup.userId && backup.userId !== user.id ? `（ID「${backup.userId}」のバックアップです）` : ''}`)),
            h('div', { class: 'label-confirm-actions' },
              h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => restoreArea.replaceChildren() }, 'やめる'),
              h('button', {
                type: 'button',
                class: 'btn btn-danger btn-sm',
                onClick: () => {
                  try {
                    restoreUserData(user.id, backup);
                    location.reload(); // すべての画面を新しいデータで表示し直す
                  } catch (err) { showError(backupErr, err.message); }
                },
              }, '読み込む'),
            ),
          ));
        } catch (err) { showError(backupErr, err.message); }
      });

      sections.push(h('section', { class: 'acc-section' },
        h('h3', { class: 'sub-head' }, 'データのバックアップ'),
        h('p', { class: 'muted' }, 'データはこの端末のブラウザにだけ保存されています。ファイルに書き出しておけば、ブラウザのデータを消したときや、別の端末に移すときに読み込めます。'),
        h('div', { class: 'acc-buttons' },
          h('button', {
            type: 'button',
            class: 'btn btn-ghost btn-sm',
            onClick: () => {
              try {
                const count = downloadBackup(user.id);
                showToast(`バックアップを書き出しました（${count}項目）`);
              } catch { showError(backupErr, '書き出せませんでした。'); }
            },
          }, icon('download'), 'ファイルに書き出す'),
          h('label', { class: 'btn btn-ghost btn-sm', for: 'acc-restore-file' }, icon('upload'), 'ファイルから読み込む'),
          fileInput,
        ),
        restoreArea,
        backupErr,
      ));

      // ---------- 危険な操作 ----------
      const danger = h('div', { class: 'danger-area' });
      const renderDanger = () => danger.replaceChildren(...[
        h('button', { type: 'button', class: 'btn btn-danger-text btn-sm', onClick: confirmReset }, icon('reset'), 'すべてのデータを消す'),
        !builtIn && h('button', { type: 'button', class: 'btn btn-danger-text btn-sm', onClick: confirmDelete }, icon('trash'), 'アカウントを削除'),
      ].filter(Boolean));

      function confirmReset() {
        danger.replaceChildren(h('div', { class: 'label-confirm' },
          h('p', {}, h('strong', {}, 'このアカウントのデータをすべて消しますか？'),
            h('span', {}, '予定・Todo・記録・履歴書・目標などが消えます。アカウントは残ります。元に戻せないので、先にバックアップをおすすめします。')),
          h('div', { class: 'label-confirm-actions' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: renderDanger }, 'やめる'),
            h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: () => { deleteUserData(user.id); location.reload(); } }, '消す'),
          ),
        ));
      }

      function confirmDelete() {
        const pw = passwordInput({ id: 'acc-delete-pw', autocomplete: 'current-password', placeholder: 'パスワード' });
        const err = errorBox();
        danger.replaceChildren(h('form', {
          class: 'label-confirm',
          novalidate: true,
          onSubmit: async (e) => {
            e.preventDefault();
            try {
              const id = await auth.deleteAccount(pw.input.value);
              deleteUserData(id);
              sheet.close();
              auth.logout();
              showToast('アカウントを削除しました');
            } catch (er) { showError(err, er.message); }
          },
        },
          h('p', {}, h('strong', {}, 'アカウントを削除しますか？'),
            h('span', {}, 'アカウントと、このアカウントのデータがすべて消えます。確認のためパスワードを入力してください。')),
          h('label', { class: 'visually-hidden', for: 'acc-delete-pw' }, 'パスワード'),
          pw.row,
          err,
          h('div', { class: 'label-confirm-actions' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: renderDanger }, 'やめる'),
            h('button', { type: 'submit', class: 'btn btn-danger btn-sm' }, '削除する'),
          ),
        ));
        pw.input.focus();
      }

      renderDanger();
      sections.push(h('section', { class: 'acc-section' }, h('h3', { class: 'sub-head' }, 'データの削除'), danger));

      return h('div', { class: 'account-sheet' },
        ...sections,
        h('div', { class: 'sheet-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, '閉じる')),
      );
    },
  });
}
