const campaignText = (() => {
  const markdown = typeof window.markdownit === 'function'
    ? window.markdownit('zero', { html: false, breaks: true }).enable(['emphasis', 'list', 'newline'])
    : null;

  function render(container, source) {
    if (markdown) {
      container.innerHTML = markdown.render(source ?? '');
    } else {
      container.classList.add('is-plain');
      container.textContent = source;
    }
  }

  function toggleEmphasis(input, marker) {
    const { value, selectionStart, selectionEnd } = input;
    const selected = value.slice(selectionStart, selectionEnd);
    const content = selected.trim();
    const size = marker.length;
    const hasMarker = (left, right) => {
      const opening = left.match(/\*+$/)?.[0].length ?? 0;
      const closing = right.match(/^\*+/)?.[0].length ?? 0;
      const paired = Math.min(opening, closing);
      return size === 1 ? paired % 2 === 1 : paired >= 2;
    };
    if (!content) {
      input.setRangeText(marker + marker, selectionEnd, selectionEnd, 'end');
      input.setSelectionRange(selectionEnd + size, selectionEnd + size);
      return;
    }

    const start = selectionStart + selected.length - selected.trimStart().length;
    const end = start + content.length;
    if (hasMarker(value.slice(0, start), value.slice(end))) {
      input.setRangeText(content, start - size, end + size, 'select');
    } else if (content.length > 2 * size && hasMarker(content, content)) {
      input.setRangeText(content.slice(size, -size), start, end, 'select');
    } else {
      input.setRangeText(marker + content + marker, start, end, 'select');
      input.setSelectionRange(start + size, end + size);
    }
  }

  function toggleBullets(input) {
    const { value, selectionStart, selectionEnd } = input;
    const start = value.slice(0, selectionStart).lastIndexOf('\n') + 1;
    const last = selectionEnd > selectionStart && value[selectionEnd - 1] === '\n' ? selectionEnd - 1 : selectionEnd;
    const newline = value.indexOf('\n', last);
    const end = newline === -1 ? value.length : newline;
    const lines = value.slice(start, end).split('\n');
    const nonempty = lines.filter((line) => line.trim());
    const bullet = /^([ \t]*)[-*+] /;
    const remove = nonempty.length > 0 && nonempty.every((line) => bullet.test(line));
    const replacement = lines.map((line) => {
      if (remove) return line.replace(bullet, '$1');
      if (bullet.test(line) || (!line.trim() && lines.length > 1)) return line;
      return line.replace(/^([ \t]*)/, '$1- ');
    }).join('\n');
    input.setRangeText(replacement, start, end, selectionStart === selectionEnd ? 'end' : 'select');
  }

  const controls = [
    { label: 'Bold', symbol: '<strong>B</strong>', format: (input) => toggleEmphasis(input, '**') },
    { label: 'Italic', symbol: '<em>I</em>', format: (input) => toggleEmphasis(input, '*') },
    { label: 'Bullet list', symbol: '<span aria-hidden="true">•</span> List', format: toggleBullets },
  ];

  function attach(form) {
    if (!markdown) return;
    for (const field of form.querySelectorAll('.formatted-writing')) {
      const input = field.querySelector('textarea');
      const label = field.querySelector('label');
      const group = document.createElement('div');
      group.className = 'formatting-controls';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', `Formatting for ${label.textContent}`);
      for (const { label, symbol, format } of controls) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = symbol;
        button.addEventListener('click', () => {
          format(input);
          input.focus({ preventScroll: true });
        });
        group.append(button);
      }
      field.insertBefore(group, input);
    }
  }

  return { attach, render };
})();
