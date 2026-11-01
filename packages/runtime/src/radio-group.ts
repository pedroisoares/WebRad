import { WebComponent, type WebComponentEventHandler } from './component.js';

export const WEB_RADIO_GROUP_ORIENTATIONS = ['vertical', 'horizontal'] as const;
export type WebRadioGroupOrientation = (typeof WEB_RADIO_GROUP_ORIENTATIONS)[number];

export interface WebRadioItem {
  readonly label: string;
  readonly value: string;
}

let radioGroupSequence = 0;

/**
 * A single-choice group of native radio buttons inside a fieldset, so the
 * browser provides arrow-key navigation, form semantics and disabled state.
 */
export class WebRadioGroup extends WebComponent<HTMLFieldSetElement> {
  readonly #groupName: string;

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLFieldSetElement)) {
      throw new TypeError('WebRadioGroup requires a fieldset element.');
    }
    super(element);
    element.setAttribute('role', 'radiogroup');
    const existing = element.querySelector<HTMLInputElement>('input[type="radio"]')?.name;
    radioGroupSequence += 1;
    this.#groupName =
      existing !== undefined && existing.length > 0
        ? existing
        : `wr-radio-${element.dataset.webradId ?? String(radioGroupSequence)}-${String(radioGroupSequence)}`;
  }

  #inputs(): HTMLInputElement[] {
    return [...this.element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  }

  /** Captions shown beside each option. */
  public get items(): readonly string[] {
    return this.#inputs().map((input) => input.dataset.webradLabel ?? input.value);
  }

  public set items(items: readonly (string | WebRadioItem)[]) {
    const previous = this.value;
    const document = this.element.ownerDocument;
    const options = items.map((item) =>
      typeof item === 'string' ? { label: item, value: item } : item,
    );
    const labels = options.map((option, index) => {
      const label = document.createElement('label');
      label.className = 'wr-radio-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = this.#groupName;
      input.value = option.value;
      input.dataset.webradLabel = option.label;
      input.dataset.webradIndex = String(index);
      const caption = document.createElement('span');
      caption.className = 'wr-radio-caption';
      caption.textContent = option.label;
      label.append(input, caption);
      return label;
    });
    const legend = this.element.querySelector(':scope > legend');
    this.element.replaceChildren(...(legend === null ? [] : [legend]), ...labels);
    if (previous.length > 0) this.value = previous;
  }

  /** Values sent to code and APIs; defaults to each caption. */
  public get values(): readonly string[] {
    return this.#inputs().map((input) => input.value);
  }

  public set values(values: readonly string[]) {
    const items = this.items;
    if (values.length !== 0 && values.length !== items.length) {
      throw new RangeError('RadioGroup Values must have one value per item.');
    }
    const selectedIndex = this.selectedIndex;
    this.items = items.map((label, index) => ({ label, value: values[index] ?? label }));
    this.selectedIndex = selectedIndex;
  }

  /** Optional visible title rendered as the fieldset legend. */
  public get caption(): string {
    return this.element.querySelector(':scope > legend')?.textContent ?? '';
  }

  public set caption(value: string) {
    let legend = this.element.querySelector<HTMLLegendElement>(':scope > legend');
    if (value.length === 0) {
      legend?.remove();
      return;
    }
    if (legend === null) {
      legend = this.element.ownerDocument.createElement('legend');
      legend.className = 'wr-radio-legend';
      this.element.prepend(legend);
    }
    legend.textContent = value;
  }

  public get value(): string {
    return this.#inputs().find((input) => input.checked)?.value ?? '';
  }

  public set value(value: string) {
    for (const input of this.#inputs()) input.checked = input.value === value;
  }

  /** Zero-based index of the checked option, or -1. */
  public get selectedIndex(): number {
    return this.#inputs().findIndex((input) => input.checked);
  }

  public set selectedIndex(value: number) {
    this.#inputs().forEach((input, index) => {
      input.checked = index === value;
    });
  }

  /** Caption of the checked option, or ''. */
  public get selectedItem(): string {
    const input = this.#inputs().find((candidate) => candidate.checked);
    return input === undefined ? '' : (input.dataset.webradLabel ?? input.value);
  }

  public get orientation(): WebRadioGroupOrientation {
    return this.element.dataset.webradOrientation === 'horizontal' ? 'horizontal' : 'vertical';
  }

  public set orientation(value: WebRadioGroupOrientation) {
    const orientation = value === 'horizontal' ? 'horizontal' : 'vertical';
    this.element.dataset.webradOrientation = orientation;
    this.element.setAttribute('aria-orientation', orientation);
  }

  public get required(): boolean {
    return this.#inputs()[0]?.required ?? false;
  }

  public set required(value: boolean) {
    for (const input of this.#inputs()) input.required = value;
    if (value) this.element.setAttribute('aria-required', 'true');
    else this.element.removeAttribute('aria-required');
  }

  /** Marks the group invalid when required and nothing is checked. */
  public validate(): boolean {
    const valid = !this.required || this.selectedIndex >= 0;
    if (valid) this.element.removeAttribute('aria-invalid');
    else this.element.setAttribute('aria-invalid', 'true');
    return valid;
  }

  public clear(): void {
    this.selectedIndex = -1;
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }
}
