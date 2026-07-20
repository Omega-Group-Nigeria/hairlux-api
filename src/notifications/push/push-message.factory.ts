import { Injectable, Logger } from '@nestjs/common';
import { PUSH_COPY } from './push-notification.constants';
import type { PushEventKey, PushTemplateVars } from './push-event.types';

export type ResolvedPushMessage = {
  type: PushEventKey;
  title: string;
  body: string;
};

@Injectable()
export class PushMessageFactory {
  private readonly logger = new Logger(PushMessageFactory.name);

  /**
   * Resolve title/body from the single constants catalog.
   * Missing `{{vars}}` are replaced with empty string (soft).
   */
  resolve(event: PushEventKey, vars: PushTemplateVars = {}): ResolvedPushMessage {
    const copy = PUSH_COPY[event];
    if (!copy) {
      this.logger.warn(`No PUSH_COPY entry for event ${event}`);
      return {
        type: event,
        title: 'HairLux',
        body: 'You have a new notification.',
      };
    }

    return {
      type: event,
      title: this.interpolate(copy.title, vars),
      body: this.interpolate(copy.body, vars),
    };
  }

  /** Format Naira amounts for display in templates (no ₦ prefix). */
  formatAmount(amount: number): string {
    if (!Number.isFinite(amount)) {
      return '0';
    }
    return amount.toLocaleString('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  private interpolate(template: string, vars: PushTemplateVars): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = vars[key];
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }
}
