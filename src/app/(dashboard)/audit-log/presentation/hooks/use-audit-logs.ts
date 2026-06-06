'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { listAuditLogsAction, type ListAuditLogsParams, type ListAuditLogsResult } from '../../actions';

const EMPTY_RESULT: ListAuditLogsResult = {
  rows: [],
  rowCount: 0,
  pageInfo: {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: undefined,
    endCursor: undefined,
    limit: 20,
  },
};

export function useAuditLogs(initialData: ListAuditLogsResult) {
  const [data, setData] = useState<ListAuditLogsResult>(initialData);
  const [pending, start] = useTransition();

  function load(params: ListAuditLogsParams) {
    start(async () => {
      const r = await listAuditLogsAction(params);
      if (r.ok) {
        setData(r.data);
      } else {
        toast.error(r.message);
        setData(EMPTY_RESULT);
      }
    });
  }

  return { data, pending, load };
}
