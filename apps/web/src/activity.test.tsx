import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_STATUS, ACTIVITY_STEPS, ActivityBadge, EVALUATION_LABEL, FIELD_LABEL, REWARD_LABEL, vnd, WORKFLOW_LABEL } from './format';

describe('nhan hoat dong', () => {
  it('moi buoc cua tien trinh deu co nhan tieng Viet', () => {
    for (const s of ACTIVITY_STEPS) expect(ACTIVITY_STATUS[s][0]).toMatch(/\S/);
    expect(ACTIVITY_STEPS).toHaveLength(6);
  });
  it('moi hanh dong quy trinh va moi ket qua deu co nhan', () => {
    for (const a of ['SUBMIT', 'APPROVE', 'RETURN', 'SUBMIT_RESULT', 'EVALUATE', 'REWARD', 'REOPEN']) expect(WORKFLOW_LABEL[a]).toBeTruthy();
    expect(EVALUATION_LABEL.NOT_COMPLETED[1]).toBe('err');
    expect(REWARD_LABEL.REJECTED[1]).toBe('draft');
  });
  it('cac truong thuong gap khi so sanh phien ban co nhan', () => {
    for (const k of ['name', 'startAt', 'planUrl', 'links', 'coUnitIds']) expect(FIELD_LABEL[k]).toBeTruthy();
  });
  it('vnd: null la gach ngang, so co dau phan cach', () => {
    expect(vnd(null)).toBe('—');
    expect(vnd(0)).toBe('0 đ');
    expect(vnd(5_000_000)).toMatch(/^5[.,\s ]000[.,\s ]000 đ$/);
  });
  it('ActivityBadge hien nhan va mau, trang thai la thi hien nguyen ma', () => {
    const { rerender } = render(<ActivityBadge status="PENDING_PLAN" />);
    expect(screen.getByText('Chờ duyệt kế hoạch').className).toContain('wait');
    rerender(<ActivityBadge status="LOCKED" />);
    expect(screen.getByText('Đã chốt').className).toContain('ok');
    rerender(<ActivityBadge status="KHONG_BIET" />);
    expect(screen.getByText('KHONG_BIET').className).toContain('draft');
  });
});
