// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog, MessageDialog, Toast } from '../src/index.js';

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.lang = '';
  vi.useRealTimers();
});

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.wr-feedback-button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (found === undefined) throw new Error(`Missing button ${label}`);
  return found;
}

describe('Toast', () => {
  it('stacks toasts in a region and closes them after the duration', async () => {
    vi.useFakeTimers();
    const first = Toast('Salvo com sucesso', { kind: 'success', title: 'Chamado 42' });
    Toast('Outro aviso');
    const region = document.querySelector('.wr-toast-region');
    expect(region?.getAttribute('data-webrad-position')).toBe('top-right');
    expect(region?.children).toHaveLength(2);
    expect(first.element.getAttribute('role')).toBe('status');
    expect(first.element.dataset.webradKind).toBe('success');
    expect(first.element.querySelector('.wr-toast-title')?.textContent).toBe('Chamado 42');
    vi.advanceTimersByTime(4000);
    await first.closed;
    expect(document.querySelector('.wr-toast-region')).toBeNull();
  });

  it('keeps errors longer, announces them and pauses on hover', () => {
    vi.useFakeTimers();
    const toast = Toast('Falha ao salvar', { kind: 'error' });
    expect(toast.element.getAttribute('role')).toBe('alert');
    vi.advanceTimersByTime(4000);
    expect(toast.element.isConnected).toBe(true);
    toast.element.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(10000);
    expect(toast.element.isConnected).toBe(true);
    toast.element.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(7000);
    expect(toast.element.isConnected).toBe(false);
  });

  it('runs its action, closes by button and stays when duration is 0', () => {
    vi.useFakeTimers();
    const undo = vi.fn();
    const toast = Toast('Item removido', {
      duration: 0,
      action: { label: 'Desfazer', onClick: undo },
    });
    vi.advanceTimersByTime(60000);
    expect(toast.element.isConnected).toBe(true);
    toast.element.querySelector<HTMLButtonElement>('.wr-toast-action')?.click();
    expect(undo).toHaveBeenCalledOnce();
    expect(toast.element.isConnected).toBe(false);
    const other = Toast('Fechar manual', { position: 'bottom-center' });
    expect(other.element.parentElement?.dataset.webradPosition).toBe('bottom-center');
    other.element.querySelector<HTMLButtonElement>('.wr-toast-close')?.click();
    expect(other.element.isConnected).toBe(false);
  });

  it('renders messages as text, not HTML', () => {
    const toast = Toast('<img src=x onerror=alert(1)>');
    expect(toast.element.querySelector('img')).toBeNull();
    expect(toast.element.textContent).toContain('<img');
  });
});

describe('ConfirmDialog', () => {
  it('resolves true on confirm with localized defaults', async () => {
    document.documentElement.lang = 'pt-BR';
    const result = ConfirmDialog('Encerrar o chamado?');
    const dialog = document.querySelector('dialog.wr-feedback-dialog');
    expect(dialog?.querySelector('.wr-feedback-title')?.textContent).toBe('Confirmação');
    expect(dialog?.querySelector('.wr-feedback-message')?.textContent).toBe('Encerrar o chamado?');
    button('Confirmar').click();
    await expect(result).resolves.toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('resolves false on cancel and on Escape', async () => {
    const cancelled = ConfirmDialog('Delete?', { cancelText: 'No', confirmText: 'Yes' });
    button('No').click();
    await expect(cancelled).resolves.toBe(false);
    const escaped = ConfirmDialog('Delete?');
    document.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await expect(escaped).resolves.toBe(false);
  });

  it('focuses Cancel and marks the button for destructive actions', async () => {
    const result = ConfirmDialog('Excluir usuário?', {
      kind: 'error',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
    });
    expect(document.querySelector('dialog')?.getAttribute('role')).toBe('alertdialog');
    expect(button('Excluir').dataset.webradDanger).toBe('true');
    expect(document.activeElement).toBe(button('Cancelar'));
    button('Excluir').click();
    await expect(result).resolves.toBe(true);
  });
});

describe('MessageDialog', () => {
  it('resolves when OK is chosen and hides an empty title', async () => {
    const result = MessageDialog('Operação concluída', { okText: 'Fechar' });
    expect(document.querySelector<HTMLElement>('.wr-feedback-title')?.hidden).toBe(true);
    button('Fechar').click();
    await expect(result).resolves.toBeUndefined();
  });
});
