import { baseTemplate } from './base.template';

export function staffBirthdayTemplate(firstName: string): string {
  const content = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;">Happy Birthday, ${firstName}! 🎉🎂</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#555555;line-height:1.6;">
      We are so happy to celebrate you today! 
      Thank you for all your hard work and the good energy you bring to HairLux every day. 
      You are a very important part of our team and we really appreciate you.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#555555;line-height:1.6;">
      May God bless you with long life, good health, more success and all the happiness you deserve. 
      Let this new age be the best one yet, filled with joy, peace and many good things.
    </p>
    <p style="margin:0;font-size:14px;color:#777777;line-height:1.6;">
      Enjoy your special day to the fullest. Eat plenty cake, smile plenty and have plenty fun!
    </p>
  `;

  return baseTemplate({
    title: 'Happy Birthday — HairLux',
    previewText: `Happy Birthday ${firstName} from HairLux`,
    content,
  });
}
