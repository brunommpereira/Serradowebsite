import { bodyToHtml, htmlToText, isHtml } from './rich-text';

describe('texto rico do CMS', () => {
  it('texto simples antigo passa a parágrafos, com os sinais escapados', () => {
    expect(bodyToHtml('Um <b>dois</b>\n\nTrês\nquatro')).toBe('<p>Um &lt;b&gt;dois&lt;/b&gt;</p><p>Três<br>quatro</p>');
    expect(bodyToHtml('')).toBe('');
    expect(bodyToHtml(null)).toBe('');
  });

  it('HTML do editor mantém-se', () => {
    expect(isHtml('<p>Olá</p>')).toBe(true);
    expect(bodyToHtml('<h2>Título</h2><p>Olá</p>')).toBe('<h2>Título</h2><p>Olá</p>');
  });

  it('HTML → texto para contagens', () => {
    expect(htmlToText('<h2>Título</h2><p>Olá &amp; <strong>adeus</strong></p><ul><li>um</li><li>dois</li></ul>')).toBe('Título Olá & adeus um dois');
  });
});
