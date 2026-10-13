# Project instructions

## Coding rules

- Viết clean code: ưu tiên tên biến/hàm rõ nghĩa, hàm có trách nhiệm đơn nhất, logic đơn giản và dễ kiểm thử.
- Không hardcode trong production code. Không dùng magic numbers, magic strings hoặc giá trị domain rải rác trong nhiều file; đưa chúng vào constants, enum, cấu hình hoặc nguồn dữ liệu phù hợp. Test fixtures cũng phải dùng tên hằng số có ý nghĩa khi giá trị được dùng lặp lại.
- Tuyệt đối không dùng TypeScript type assertion bằng `as`, bao gồm cả `as const`. Không dùng angle-bracket type assertion để thay thế. Hãy sửa kiểu dữ liệu, dùng generic, type guard, overload hoặc `satisfies` khi phù hợp.
- Không thêm `any` hoặc tắt rule ESLint để né lỗi. Nếu code hiện tại có pattern không phù hợp, không nhân rộng pattern đó trong phần code mới.
- Không tạo abstraction, fallback hoặc validation thừa nếu không phục vụ yêu cầu hiện tại.
- Giữ tenant isolation, không bỏ qua các ràng buộc dữ liệu hoặc validation hiện có để làm cho test/build pass.

## Coding convention

- Trước khi sửa code, đọc file liên quan và các file lân cận để tuân theo convention hiện hữu của module.
- Kiểm tra `package.json`, ESLint config, Prettier config, tsconfig và pattern triển khai tương tự trước khi chọn cách implement.
- Ưu tiên chỉnh sửa nhỏ, nhất quán với kiến trúc hiện tại; không đổi naming hoặc public contract ngoài phạm vi yêu cầu.
- Không sửa hoặc xóa thay đổi chưa được yêu cầu của người dùng.

## Required validation

Sau mỗi thay đổi code, chạy các kiểm tra phù hợp với phần đã sửa. Tối thiểu:

- Server: `yarn workspace server tsc --noEmit`
- Server ESLint: `yarn workspace server eslint "{src,apps,libs,test}/**/*.ts"`
- Client ESLint: `yarn workspace client lint`
- Chạy test liên quan; trước khi hoàn tất, chạy full test suite nếu thời gian và môi trường cho phép.
- Với thay đổi build/runtime, chạy build tương ứng: `yarn workspace server build` hoặc `yarn workspace client build`.
- Chạy `git diff --check` trước khi báo hoàn tất.

Không dùng `eslint --fix` để che khuất lỗi mà không kiểm tra diff. Không bỏ qua lỗi lint, typecheck hoặc test bằng flag bypass.
