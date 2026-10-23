// إرسال الرسائل لولي الأمر. دلوقتي: طباعة في الطرفية + تخزين في الذاكرة للاختبارات.
// بعدين: WhatsApp Business API / SMS / إيميل / إشعار في تطبيق ولي الأمر — كلهم بنفس الواجهة.
import type { ParentContact, ParentNotification } from "../journey/types";

export interface Notifier {
  send(to: ParentContact, notification: ParentNotification): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async send(to: ParentContact, notification: ParentNotification): Promise<void> {
    console.log(`\n✉️  إلى ${to.name}${to.phone ? ` (${to.phone})` : ""}\n${notification.text}\n`);
  }
}

export class MemoryNotifier implements Notifier {
  readonly sent: Array<{ to: ParentContact; notification: ParentNotification }> = [];
  async send(to: ParentContact, notification: ParentNotification): Promise<void> {
    this.sent.push({ to, notification });
  }
}
