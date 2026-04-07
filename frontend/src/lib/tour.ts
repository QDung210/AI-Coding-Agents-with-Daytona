import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_KEY = 'ai-dev-workspace:tour-done';

export function isDashboardTourDone(): boolean {
  return localStorage.getItem(TOUR_KEY) === '1';
}

export function markDashboardTourDone(): void {
  localStorage.setItem(TOUR_KEY, '1');
}

export function resetTour(): void {
  localStorage.removeItem(TOUR_KEY);
}

export function startDashboardTour() {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 6,
    popoverClass: 'ai-workspace-tour',

    onDestroyStarted: () => {
      markDashboardTourDone();
      driverObj.destroy();
    },

    steps: [
      {
        popover: {
          title: '👋 Welcome to AI Dev Workspace',
          description:
            'Công cụ giúp bạn tạo task coding và để AI agent tự động thực thi trong Daytona sandbox. Hãy để chúng tôi hướng dẫn nhanh.',
          side: 'over',
          align: 'center',
        },
      },
      {
        element: '#tour-sidebar',
        popover: {
          title: '📁 Navigation',
          description:
            '<b>Dashboard</b> — xem toàn bộ task đang chạy.<br/><b>New Task</b> — tạo task mới và launch AI agent.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '#tour-new-task-btn',
        popover: {
          title: '➕ Tạo Task Mới',
          description:
            'Bắt đầu từ đây. Nhập prompt mô tả yêu cầu (hoặc gắn repo URL), chọn môi trường, và agent sẽ tự động làm việc.',
          side: 'bottom',
          align: 'end',
        },
      },
      {
        element: '#tour-stats',
        popover: {
          title: '📊 Thống Kê',
          description:
            'Tổng số task, đang chạy, đã hoàn thành, và thất bại. Tự cập nhật mỗi 5 giây khi có task đang active.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#tour-task-list',
        popover: {
          title: '🗂️ Danh Sách Task',
          description:
            'Mỗi card là một task. Click vào để xem logs realtime, trạng thái agent, và preview app đang chạy trong sandbox.',
          side: 'top',
          align: 'start',
        },
      },
      {
        popover: {
          title: '🚀 Bắt Đầu Thôi!',
          description:
            'Tạo task đầu tiên bằng cách click <b>New Task</b> và nhập một prompt đơn giản như:<br/><br/><code style="background:#1E293B;padding:4px 8px;border-radius:4px;font-size:12px">Create a Flask app that returns Hello World on port 3000</code>',
          side: 'over',
          align: 'center',
        },
      },
    ],
  });

  driverObj.drive();
  return driverObj;
}

export function startRunDetailTour() {
  const RUN_TOUR_KEY = 'ai-dev-workspace:run-tour-done';
  if (localStorage.getItem(RUN_TOUR_KEY) === '1') return null;

  const driverObj = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 6,
    popoverClass: 'ai-workspace-tour',

    onDestroyStarted: () => {
      localStorage.setItem(RUN_TOUR_KEY, '1');
      driverObj.destroy();
    },

    steps: [
      {
        element: '#tour-agent-pipeline',
        popover: {
          title: '🤖 Agent Pipeline',
          description:
            'Hiển thị tiến trình của AI agent: <b>Intake → Plan → Execute → Evaluate → Finalize</b>. Bước đang chạy sẽ nhấp nháy màu vàng.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '#tour-log-panel',
        popover: {
          title: '📟 Terminal Output',
          description:
            'Log realtime từ agent — xem agent đang cài gì, chạy lệnh gì, gặp lỗi gì. Có nút <b>Copy</b> và <b>Expand</b> để xem toàn màn hình.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '#tour-preview-panel',
        popover: {
          title: '🌐 Preview',
          description:
            'Nếu agent start một web server (port 3000–9999), iframe này sẽ hiện app đang chạy thật trong Daytona sandbox.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '#tour-run-summary',
        popover: {
          title: '📝 Summary',
          description:
            'Sau khi hoàn thành, AI tổng kết những gì đã làm và (nếu có) hiển thị diff/patch của các file đã thay đổi.',
          side: 'left',
          align: 'start',
        },
      },
    ],
  });

  driverObj.drive();
  return driverObj;
}
