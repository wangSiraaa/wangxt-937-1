import { useEffect, useState, useRef } from "react";
import { useStore } from "@/store";
import type { Registration } from "@/store";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: "待缴费", cls: "bg-amber-50 text-amber-700" },
  paid: { label: "已缴费", cls: "bg-emerald-50 text-emerald-700" },
  grouped: { label: "已入组", cls: "bg-blue-50 text-blue-700" },
  withdrawn: { label: "已退赛", cls: "bg-gray-100 text-gray-500" },
  cancelled: { label: "已取消", cls: "bg-red-50 text-red-600" },
};

export default function Register() {
  const {
    events,
    registrations,
    fetchEvents,
    fetchRegistrations,
    createRegistration,
    updateRegistration,
    deleteRegistration,
    loading,
  } = useStore();

  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [editReg, setEditReg] = useState<Registration | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    event_id: "",
    player_name: "",
    id_number: "",
    phone: "",
    birth_year: "",
    emergency_contact: "",
    emergency_phone: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchEvents();
    fetchRegistrations();
  }, [fetchEvents, fetchRegistrations]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.event_id) e.event_id = "请选择赛事";
    if (!form.player_name.trim()) e.player_name = "请输入选手姓名";
    if (!form.id_number.trim()) e.id_number = "请输入身份证号";
    if (!form.phone.trim()) e.phone = "请输入手机号";
    if (!form.birth_year) e.birth_year = "请输入出生年份";
    else if (Number(form.birth_year) < 1900 || Number(form.birth_year) > new Date().getFullYear())
      e.birth_year = "出生年份无效";
    if (!form.emergency_contact.trim()) e.emergency_contact = "请输入紧急联系人";
    if (!form.emergency_phone.trim()) e.emergency_phone = "请输入紧急联系电话";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (proofFile) fd.append("proof", proofFile);
      await createRegistration(fd);
      setToast({ type: "ok", msg: "报名成功！" });
      resetForm();
    } catch (err: any) {
      setToast({ type: "err", msg: err.message || "报名失败" });
    }
  };

  const resetForm = () => {
    setForm({
      event_id: "",
      player_name: "",
      id_number: "",
      phone: "",
      birth_year: "",
      emergency_contact: "",
      emergency_phone: "",
    });
    setProofFile(null);
    setErrors({});
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除此报名记录？")) return;
    try {
      await deleteRegistration(id);
      setToast({ type: "ok", msg: "已删除" });
    } catch (err: any) {
      setToast({ type: "err", msg: err.message || "删除失败" });
    }
  };

  const handleEditSave = async () => {
    if (!editReg) return;
    try {
      const fd = new FormData();
      fd.append("event_id", String(editReg.event_id));
      fd.append("player_name", editReg.player_name);
      fd.append("id_number", editReg.id_number);
      fd.append("phone", editReg.phone);
      fd.append("birth_year", String(editReg.birth_year));
      fd.append("emergency_contact", editReg.emergency_contact);
      fd.append("emergency_phone", editReg.emergency_phone);
      if (proofFile) fd.append("proof", proofFile);
      await updateRegistration(editReg.id, fd);
      setToast({ type: "ok", msg: "修改成功" });
      setEditReg(null);
      setProofFile(null);
    } catch (err: any) {
      setToast({ type: "err", msg: err.message || "修改失败" });
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all ${
            toast.type === "ok" ? "bg-emerald-500" : "bg-red-500"
          }`}
        >
          {toast.type === "ok" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
          <button onClick={() => setToast(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <ClipboardList className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-primary">选手报名</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-800">新增报名</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="赛事" error={errors.event_id} required>
              <select
                className="input-field"
                value={form.event_id}
                onChange={(e) => setForm({ ...form, event_id: e.target.value })}
              >
                <option value="">请选择赛事</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="选手姓名" error={errors.player_name} required>
                <input
                  className="input-field"
                  value={form.player_name}
                  onChange={(e) => setForm({ ...form, player_name: e.target.value })}
                />
              </FormField>
              <FormField label="身份证号" error={errors.id_number} required>
                <input
                  className="input-field"
                  value={form.id_number}
                  onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="手机号" error={errors.phone} required>
                <input
                  className="input-field"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </FormField>
              <FormField label="出生年份" error={errors.birth_year} required>
                <input
                  type="number"
                  className="input-field"
                  value={form.birth_year}
                  onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="紧急联系人" error={errors.emergency_contact} required>
                <input
                  className="input-field"
                  value={form.emergency_contact}
                  onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
                />
              </FormField>
              <FormField label="紧急联系电话" error={errors.emergency_phone} required>
                <input
                  className="input-field"
                  value={form.emergency_phone}
                  onChange={(e) => setForm({ ...form, emergency_phone: e.target.value })}
                />
              </FormField>
            </div>

            <FormField label="证明材料">
              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <Upload className="h-4 w-4" />
                  {proofFile ? proofFile.name : "选择文件"}
                </button>
                {proofFile && (
                  <button type="button" onClick={() => setProofFile(null)}>
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>
            </FormField>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              提交报名
            </button>
          </form>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-gray-800">我的报名</h3>
          {registrations.length === 0 ? (
            <p className="py-8 text-center text-gray-400">暂无报名记录</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="pb-3 pr-3 font-medium">姓名</th>
                    <th className="pb-3 pr-3 font-medium">身份证</th>
                    <th className="pb-3 pr-3 font-medium">年龄组</th>
                    <th className="pb-3 pr-3 font-medium">状态</th>
                    <th className="pb-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r) => {
                    const s = STATUS_MAP[r.status] ?? {
                      label: r.status,
                      cls: "bg-gray-100 text-gray-600",
                    };
                    return (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-2.5 pr-3 font-medium text-gray-800">
                          {r.player_name}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-500">{r.id_number}</td>
                        <td className="py-2.5 pr-3 text-gray-500">{r.age_group}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditReg({ ...r })}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-primary"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editReg && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">编辑报名</h3>
              <button onClick={() => { setEditReg(null); setProofFile(null); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <FormField label="赛事" required>
                <select
                  className="input-field"
                  value={editReg.event_id}
                  onChange={(e) =>
                    setEditReg({ ...editReg, event_id: Number(e.target.value) })
                  }
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="选手姓名">
                  <input
                    className="input-field"
                    value={editReg.player_name}
                    onChange={(e) =>
                      setEditReg({ ...editReg, player_name: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="身份证号">
                  <input
                    className="input-field"
                    value={editReg.id_number}
                    onChange={(e) =>
                      setEditReg({ ...editReg, id_number: e.target.value })
                    }
                  />
                </FormField>
              </div>
              <FormField label="上传证明材料">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </FormField>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setEditReg(null); setProofFile(null); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleEditSave}
                disabled={loading}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
