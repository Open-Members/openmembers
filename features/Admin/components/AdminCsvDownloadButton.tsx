'use client';

import { Download, Loader2 } from 'lucide-react';
import {
  useAdminCsvDownload,
  type AdminCsvDownloadCopy,
} from './useAdminCsvDownload';

export function AdminCsvDownloadButton(props: {
  endpoint: string;
  fallbackFileName: string;
  label: string;
  loadingLabel: string;
  title: string;
  copy: AdminCsvDownloadCopy;
  className: string;
}) {
  const { download, isLoading } = useAdminCsvDownload({
    endpoint: props.endpoint,
    fallbackFileName: props.fallbackFileName,
    copy: props.copy,
  });

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={isLoading}
      title={props.title}
      className={props.className}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="w-4 h-4" aria-hidden="true" />
      )}
      {isLoading ? props.loadingLabel : props.label}
    </button>
  );
}
