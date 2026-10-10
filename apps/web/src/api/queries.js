// Data hooks: one cached query per resource, plus a mutation helper that
// refreshes the affected queries and reports success/failure as a toast.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client.js";
import { useToast } from "../components/Toast.jsx";

export const keys = {
  dashboard: ["dashboard"],
  students: ["students"],
  student: (id) => ["students", Number(id)],
  teachers: ["teachers"],
  classrooms: ["classrooms"],
  curriculum: ["curriculum"],
  attendance: ["attendance"],
  fees: ["fees"],
  results: ["results"],
  exams: ["exams"],
  attention: ["attention"],
};

const listQuery = (key, path) => () => useQuery({ queryKey: key, queryFn: () => api.get(path) });

export const useDashboard = listQuery(keys.dashboard, "/dashboard");
export const useStudents = listQuery(keys.students, "/students");
export const useTeachers = listQuery(keys.teachers, "/teachers");
export const useClassrooms = listQuery(keys.classrooms, "/classrooms");
export const useCurriculum = listQuery(keys.curriculum, "/curriculum");
export const useAttendanceSummary = listQuery([...keys.attendance, "summary"], "/attendance/summary");
export const useTrends = listQuery([...keys.dashboard, "trends"], "/dashboard/trends");
export const useDefaulters = listQuery([...keys.fees, "defaulters"], "/fees/defaulters");
export const useExams = listQuery(keys.exams, "/exams");
export const useAttention = listQuery(keys.attention, "/ai/students/attention");

/**
 * One page of a paginated list: { items, total, page, pageSize, totalPages }.
 * Empty params are dropped; the previous page stays visible while the next loads.
 */
function usePaged(baseKey, path, params) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined));
  return useQuery({
    queryKey: [...baseKey, "page", clean],
    queryFn: () => api.get(`${path}?${new URLSearchParams(clean)}`),
    placeholderData: keepPreviousData,
  });
}

export const useAttendancePage = (params) => usePaged(keys.attendance, "/attendance", params);
export const useFeesPage = (params) => usePaged(keys.fees, "/fees", params);
export const useResultsPage = (params) => usePaged(keys.results, "/results", params);

export function useStudent(id) {
  return useQuery({ queryKey: keys.student(id), queryFn: () => api.get(`/students/${id}`), enabled: Boolean(id) });
}

/**
 * Wrap a write call. On success: refresh `invalidate` queries (+ dashboard) and
 * show `success` (string or fn(data)). On failure: show the server's error.
 */
export function useApiMutation(mutationFn, { invalidate = [], success } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      for (const key of [...invalidate, keys.dashboard]) queryClient.invalidateQueries({ queryKey: key });
      if (success) toast.success(typeof success === "function" ? success(data) : success);
    },
    onError: (err) => toast.error(err.message),
  });
}
