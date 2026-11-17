// Tài khoản GIẢ của mock server, chỉ dùng trên máy. Đây không phải mật khẩu thật của hệ thống nào.
// Mock chỉ có một tài khoản giao dịch (Account trong account.ts): ba tên đăng nhập dưới đây
// dùng chung số dư, danh mục và sổ lệnh, chỉ khác tên hiển thị và mã tài khoản.
export interface MockUser {
  username: string;
  password: string;
  accountId: string;
  displayName: string;
}

export const MOCK_USERS: MockUser[] = [
  { username: "demo", password: "demo123", accountId: "DEMO000001", displayName: "Nhà đầu tư Demo" },
  { username: "demo2", password: "demo123", accountId: "DEMO000002", displayName: "Nhà đầu tư Demo 2" },
  { username: "demo3", password: "demo123", accountId: "DEMO000003", displayName: "Nhà đầu tư Demo 3" },
];
