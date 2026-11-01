/**
 * In-page notifications and dialogs that replace the browser's alert and
 * confirm: toasts that disappear on their own, and promise-based modal
 * confirmation and message dialogs styled by the application theme.
 */

export const WEB_FEEDBACK_KINDS = ['info', 'success', 'warning', 'error'] as const;
export type WebFeedbackKind = (typeof WEB_FEEDBACK_KINDS)[number];

export const WEB_TOAST_POSITIONS = [
  'top-right',
  'top-left',
  'top-center',
  'bottom-right',
  'bottom-left',
  'bottom-center',
] as const;
export type WebToastPosition = (typeof WEB_TOAST_POSITIONS)[number];

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastOptions {
  readonly kind?: WebFeedbackKind;
  readonly title?: string;
  /** Milliseconds before closing; 0 keeps it until closed. Default 4000 (7000 for errors). */
  readonly duration?: number;
  readonly position?: WebToastPosition;
  /** Optional button, such as "Desfazer". Choosing it closes the toast. */
  readonly action?: ToastAction;
}

export interface WebToastHandle {
  readonly element: HTMLElement;
  close(): void;
  /** Resolves when the toast closes, by timeout, button or code. */
  readonly closed: Promise<void>;
}

export interface ConfirmDialogOptions {
  readonly title?: string;
  readonly confirmText?: string;
  readonly cancelText?: string;
  /** 'error' styles the confirm button as destructive. */
  readonly kind?: WebFeedbackKind;
}

export interface MessageDialogOptions {
  readonly title?: string;
  readonly okText?: string;
  readonly kind?: WebFeedbackKind;
}

const TEXT = {
  pt: { confirm: 'Confirmar', cancel: 'Cancelar', ok: 'OK', close: 'Fechar', title: 'Confirmação' },
  en: { confirm: 'Confirm', cancel: 'Cancel', ok: 'OK', close: 'Close', title: 'Confirmation' },
} as const;

function text(document: Document): (typeof TEXT)['pt' | 'en'] {
  const language =
    document.documentElement.lang || document.defaultView?.navigator.language || 'en';
  return language.toLowerCase().startsWith('pt') ? TEXT.pt : TEXT.en;
}

function feedbackKind(value: unknown): WebFeedbackKind {
  return typeof value === 'string' && (WEB_FEEDBACK_KINDS as readonly string[]).includes(value)
    ? (value as WebFeedbackKind)
    : 'info';
}

function toastRegion(document: Document, position: WebToastPosition): HTMLElement {
  const existing = document.querySelector<HTMLElement>(
    `.wr-toast-region[data-webrad-position="${position}"]`,
  );
  if (existing !== null) return existing;
  const region = document.createElement('section');
  region.className = 'wr-toast-region';
  region.dataset.webradPosition = position;
  region.setAttribute('aria-label', 'Notifications');
  document.body.append(region);
  return region;
}

/** Shows a short notification that closes by itself. */
export function Toast(message: unknown, options: ToastOptions = {}): WebToastHandle {
  const document = globalThis.document;
  const kind = feedbackKind(options.kind);
  const position =
    options.position !== undefined && WEB_TOAST_POSITIONS.includes(options.position)
      ? options.position
      : 'top-right';
  const labels = text(document);
  const toast = document.createElement('div');
  toast.className = 'wr-toast';
  toast.dataset.webradKind = kind;
  // Errors interrupt screen readers; other kinds wait for a pause.
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const body = document.createElement('div');
  body.className = 'wr-toast-body';
  if (options.title !== undefined && options.title.length > 0) {
    const title = document.createElement('strong');
    title.className = 'wr-toast-title';
    title.textContent = options.title;
    body.append(title);
  }
  const content = document.createElement('span');
  content.className = 'wr-toast-message';
  content.textContent = String(message);
  body.append(content);
  toast.append(body);

  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;
  const close = (): void => {
    if (isClosed) return;
    isClosed = true;
    if (timer !== null) clearTimeout(timer);
    const region = toast.parentElement;
    toast.remove();
    if (region !== null && region.childElementCount === 0) region.remove();
    resolveClosed();
  };

  if (options.action !== undefined) {
    const action = options.action;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wr-toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      close();
      action.onClick();
    });
    toast.append(button);
  }
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'wr-toast-close';
  dismiss.setAttribute('aria-label', labels.close);
  dismiss.textContent = '×';
  dismiss.addEventListener('click', close);
  toast.append(dismiss);

  toastRegion(document, position).append(toast);
  const requested = options.duration ?? (kind === 'error' ? 7000 : 4000);
  const duration = Number.isFinite(requested) ? Math.max(0, requested) : 4000;
  const start = (): void => {
    if (duration > 0 && !isClosed) timer = setTimeout(close, duration);
  };
  // Hovering or focusing pauses the timer so the message can be read.
  const pause = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  toast.addEventListener('mouseenter', pause);
  toast.addEventListener('focusin', pause);
  toast.addEventListener('mouseleave', start);
  toast.addEventListener('focusout', start);
  start();
  return { element: toast, close, closed };
}

interface DialogButton {
  readonly label: string;
  readonly value: string;
  readonly primary: boolean;
  readonly danger: boolean;
}

function openDialog(
  message: unknown,
  title: string,
  kind: WebFeedbackKind,
  buttons: readonly DialogButton[],
  cancelValue: string,
): Promise<string> {
  const document = globalThis.document;
  const dialog = document.createElement('dialog');
  dialog.className = 'wr-feedback-dialog';
  dialog.dataset.webradKind = kind;
  const id = `wr-feedback-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', title.length > 0 ? `${id}-title` : `${id}-message`);
  dialog.setAttribute('aria-describedby', `${id}-message`);
  if (kind === 'error' || kind === 'warning') dialog.setAttribute('role', 'alertdialog');
  const heading = document.createElement('h2');
  heading.className = 'wr-feedback-title';
  heading.id = `${id}-title`;
  heading.textContent = title;
  heading.hidden = title.length === 0;
  const body = document.createElement('p');
  body.className = 'wr-feedback-message';
  body.id = `${id}-message`;
  body.textContent = String(message);
  const footer = document.createElement('div');
  footer.className = 'wr-feedback-actions';
  const restoreFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return new Promise<string>((resolve) => {
    let settled = false;
    const finish = (value: string): void => {
      if (settled) return;
      settled = true;
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      dialog.remove();
      restoreFocus?.focus();
      resolve(value);
    };
    let focusTarget: HTMLButtonElement | null = null;
    for (const button of buttons) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'wr-feedback-button';
      element.textContent = button.label;
      element.dataset.webradValue = button.value;
      if (button.primary) element.dataset.webradPrimary = 'true';
      if (button.danger) element.dataset.webradDanger = 'true';
      element.addEventListener('click', () => finish(button.value));
      footer.append(element);
      // Destructive actions start focused on Cancel so Enter does not delete by accident.
      if (focusTarget === null || (button.primary && !button.danger)) focusTarget = element;
      if (button.value === cancelValue && buttons.some((candidate) => candidate.danger))
        focusTarget = element;
    }
    dialog.append(heading, body, footer);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(cancelValue);
    });
    dialog.addEventListener('close', () => finish(cancelValue));
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    focusTarget?.focus();
  });
}

/**
 * Asks the user to confirm an action in a modal dialog. Resolves true for the
 * confirm button and false for Cancel or Escape.
 */
export async function ConfirmDialog(
  message: unknown,
  options: ConfirmDialogOptions = {},
): Promise<boolean> {
  const labels = text(globalThis.document);
  const kind = feedbackKind(options.kind ?? 'warning');
  const result = await openDialog(
    message,
    options.title ?? labels.title,
    kind,
    [
      {
        label: options.cancelText ?? labels.cancel,
        value: 'cancel',
        primary: false,
        danger: false,
      },
      {
        label: options.confirmText ?? labels.confirm,
        value: 'confirm',
        primary: true,
        danger: kind === 'error',
      },
    ],
    'cancel',
  );
  return result === 'confirm';
}

/** Shows a message in a modal dialog and resolves when the user closes it. */
export async function MessageDialog(
  message: unknown,
  options: MessageDialogOptions = {},
): Promise<void> {
  const labels = text(globalThis.document);
  const kind = feedbackKind(options.kind);
  await openDialog(
    message,
    options.title ?? '',
    kind,
    [{ label: options.okText ?? labels.ok, value: 'ok', primary: true, danger: false }],
    'ok',
  );
}
