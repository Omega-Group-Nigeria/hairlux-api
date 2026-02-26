export interface BaseEmailOptions {
  title: string;
  previewText?: string;
  content: string;
}

export function baseTemplate({
  title,
  previewText = '',
  content,
}: BaseEmailOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#161616;font-family:Arial,Helvetica,sans-serif;">

  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#161616;">${previewText}</div>

  <div>
    <table cellpadding="0" cellspacing="0" style="min-width:320px;" width="100%">
      <tbody>
        <tr>
          <!-- Left gutter -->
          <td valign="top">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tbody><tr><td bgcolor="#161616" height="150"></td></tr></tbody>
            </table>
          </td>

          <!-- Main column -->
          <td width="600">
            <table align="center" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;" width="600">
              <tbody>

                <!-- Header: Logo -->
                <tr>
                  <td align="center" bgcolor="#161616" style="padding:28px 15px 28px;">
                    <img
                      alt="HairLux"
                      src="https://res.cloudinary.com/dyazlwu3f/image/upload/v1771775045/hairlux/brand/logo-rounded-white.webp" 
                      width="150"
                      style="display:block;margin:0 auto 14px;width: 150px;"
                    />
                    <p style="margin:0;font-size:14px;font-weight:600;letter-spacing:2px;color:#ffffff;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">HairLux Beauty &amp; Wellness</p>
                  </td>
                </tr>

                <!-- Body Card -->
                <tr>
                  <td bgcolor="#C9A872" style="border-radius:0 0 10px 10px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tbody>
                        <tr>
                          <td bgcolor="#ffffff" style="border-radius:6px;padding:40px 40px 40px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">
                            ${content}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:28px 40px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tbody>
                        <tr>
                          <td align="center" style="padding:0 0 8px;font:500 12px/17px Arial,Helvetica,sans-serif;color:#a7afb3;">
                            &copy; ${new Date().getFullYear()} HairLux Beauty &amp; Wellness. All rights reserved.
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style="font:500 12px/17px Arial,Helvetica,sans-serif;color:#888888;">
                            If you didn't expect this email, you can safely ignore it.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>

              </tbody>
            </table>
          </td>

          <!-- Right gutter -->
          <td valign="top">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tbody><tr><td bgcolor="#161616" height="150"></td></tr></tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

</body>
</html>`;
}
