// Tom tat bao cao Trivy (JSON) thanh cac dong ngan: dich | goi | ban dang dung -> ban sua | ma loi
// Thoat 1 neu co phat hien; dua 20 dong dau ra annotation de doc tren trang PR.
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const lines = [];
for (const r of report.Results ?? []) {
  for (const v of r.Vulnerabilities ?? []) {
    lines.push(`${v.Severity} | ${r.Target} | ${v.PkgName} ${v.InstalledVersion} -> ${v.FixedVersion} | ${v.VulnerabilityID}`);
  }
}
if (lines.length === 0) {
  console.log('Trivy: khong co lo hong HIGH/CRITICAL da co ban sua.');
  process.exit(0);
}
console.log(lines.join('\n'));
console.log(`::error title=Trivy (${lines.length} phat hien)::${lines.slice(0, 20).join(' || ').slice(0, 1800)}`);
process.exit(1);
