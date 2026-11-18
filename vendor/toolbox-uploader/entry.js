import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import ko_KR from '@uppy/locales/lib/ko_KR.js';
import Sortable from 'sortablejs';
import '@uppy/core/css/style.min.css';
import '@uppy/dashboard/css/style.min.css';
globalThis.ToolboxUploader = { Uppy, Dashboard, ko_KR, Sortable };
