import {
  ElementRef,
  HostListener,
  Directive,
  Input,
  NgZone, OnDestroy, OnChanges, AfterContentChecked, Output, EventEmitter, SimpleChanges
} from '@angular/core';
import {WindowRef} from './window-ref.service';

const MAX_LOOKUP_RETRIES = 3;

@Directive({
    selector: '[autosize]'
})

export class AutosizeDirective implements OnDestroy, OnChanges, AfterContentChecked {
    @Input()
    set minRows(value: number) {
        this._minRows = +value;
        if (this.textAreaEl) {
            this.textAreaEl.rows = this._minRows;
        }
    };
    @Input('autosize')
    set _autosize(autosize: boolean | string) {
        this.autosize = typeof autosize === 'boolean'
            ? autosize
            : true;
    };
    private _minRows!: number;

    @Input() maxRows!: number;
    @Input() onlyGrow = false;
    @Input() useImportant = false;

    @Output() resized = new EventEmitter<number>();

    private autosize = true;
    private retries = 0;
    private textAreaEl: any;

    private _oldContent!: string;
    private _oldWidth!: number;

    private _windowResizeHandler!: (...args: Array<any>) => any;
    private _destroyed = false;

    @HostListener('input', ['$event.target'])
    onInput(textArea: HTMLTextAreaElement): void {
        this.adjust();
    }

    constructor(
        public element: ElementRef,
        private _window: WindowRef,
        private _zone: NgZone
    ) {
        if (this.element.nativeElement.tagName !== 'TEXTAREA') {
            this._findNestedTextArea();

        } else {
            this.textAreaEl = this.element.nativeElement;
            this.textAreaEl.style['overflow-y'] = 'hidden';
            this._onTextAreaFound();
        }
    }

    ngOnDestroy() {
        this._destroyed = true;
        if (this._windowResizeHandler) {
            this._window.nativeWindow.removeEventListener('resize', this._windowResizeHandler, false);
        }
    }

    ngAfterContentChecked() {
        this.adjust();
    }

    ngOnChanges(changes: SimpleChanges) {
        this.adjust(true);
    }

    _findNestedTextArea() {
        this.textAreaEl = this.element.nativeElement.querySelector('TEXTAREA');

        if (!this.textAreaEl && this.element.nativeElement.shadowRoot) {
            this.textAreaEl = this.element.nativeElement.shadowRoot.querySelector('TEXTAREA');
        }

        if (!this.textAreaEl) {
            if (this.retries >= MAX_LOOKUP_RETRIES) {
                console.warn('ngx-autosize: textarea not found');

            } else {
                this.retries++;
                setTimeout(() => {
                    this._findNestedTextArea();
                }, 100);
            }
            return;
        }

        this.textAreaEl.style['overflow-y'] = 'hidden';
        this._onTextAreaFound();

    }

    _onTextAreaFound() {
        this._addWindowResizeHandler();
        setTimeout(() => {
            this.adjust();
        });
    }

    _addWindowResizeHandler() {
        this._windowResizeHandler = debounce(() => {
            this._zone.run(() => {
                this.adjust();
            });
        }, 200);

        this._zone.runOutsideAngular(() => {
            this._window.nativeWindow.addEventListener('resize', this._windowResizeHandler, false);
        });
    }

    adjust(inputsChanged = false): void {
        if (this.autosize && !this._destroyed && this.textAreaEl && this.textAreaEl.parentNode) {

            const currentText = this.textAreaEl.value;

            if (
                inputsChanged === false &&
                currentText === this._oldContent &&
                this.textAreaEl.offsetWidth === this._oldWidth
            ) {
                return;
            }

            this._oldContent = currentText;
            this._oldWidth = this.textAreaEl.offsetWidth;

            const clone = this.textAreaEl.cloneNode(true);
            const parent = this.textAreaEl.parentNode;
            clone.style.width = this.textAreaEl.offsetWidth + 'px';
            clone.style.visibility = 'hidden';
            clone.style.position = 'absolute';
            clone.textContent = currentText;

            parent.appendChild(clone);

            clone.style['overflow-y'] = 'hidden';
            clone.style.height = 'auto';

            let height = clone.scrollHeight;

            // add into height top and bottom borders' width
            let computedStyle = this._window.nativeWindow.getComputedStyle(clone, null);
            height += parseInt(computedStyle.getPropertyValue('border-top-width'));
            height += parseInt(computedStyle.getPropertyValue('border-bottom-width'));

            if (computedStyle.getPropertyValue('box-sizing') === 'content-box') {
                height -= parseInt(computedStyle.getPropertyValue('padding-top'));
                height -= parseInt(computedStyle.getPropertyValue('padding-bottom'));
            }

            const oldHeight = this.textAreaEl.offsetHeight;
            const willGrow = height > oldHeight;

            if (this.onlyGrow === false || willGrow) {
                const lineHeight = this._getLineHeight();
                const rowsCount = height / lineHeight;

                if (this._minRows && this._minRows >= rowsCount) {
                    height = this._minRows * lineHeight;

                } else if (this.maxRows && this.maxRows <= rowsCount) {
                    // never shrink the textarea if onlyGrow is true
                    const maxHeight = this.maxRows * lineHeight;
                    height = this.onlyGrow ? Math.max(maxHeight, oldHeight): maxHeight;
                    this.textAreaEl.style['overflow-y'] = 'auto';

                } else {
                    this.textAreaEl.style['overflow-y'] = 'hidden';
                }

                const heightStyle = height + 'px';
                const important = this.useImportant ? 'important' : '';

                this.textAreaEl.style.setProperty('height', heightStyle, important);

                this.resized.emit(height);
            }

            parent.removeChild(clone);
        }
    }

    private _getLineHeight() {
        let lineHeight = parseInt(this.textAreaEl.style.lineHeight, 10);
        if (isNaN(lineHeight) && this._window.nativeWindow.getComputedStyle) {
            const styles = this._window.nativeWindow.getComputedStyle(this.textAreaEl);
            lineHeight = parseInt(styles.lineHeight, 10);
        }

        if (isNaN(lineHeight)) {
            const fontSize = this._window.nativeWindow.getComputedStyle(this.textAreaEl, null).getPropertyValue('font-size');
            lineHeight = Math.floor(parseInt(fontSize.replace('px', ''), 10) * 1.5);
        }

        return lineHeight;
    }
}

function debounce<Params extends Array<any>>(func: (...args: Params) => any, timeout: number): (...args: Params) => void {
  let timer: number;
  return (...args: Params) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      func(...args)
    }, timeout)
  }
}

// function Debounce(func: any, wait: number, immediate = false) {
//     let timeout: number | undefined;
//     return () => {
//         const context = this;
//         const args = arguments;
//         const later = function () {
//             timeout = undefined;
//             if (!immediate) {
//                 func.apply(this, args);
//             }
//         };
//         const callNow = immediate && !timeout;
//         clearTimeout(timeout);
//         timeout = setTimeout(later, wait);
//         if (callNow) {
//             func.apply(this, args);
//         }
//     };
// }
