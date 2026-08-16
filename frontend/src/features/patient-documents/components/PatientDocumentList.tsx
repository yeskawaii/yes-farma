import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Download, Trash2, Plus, AlertCircle,
  RefreshCw, Loader2, Image as ImageIcon, AlertTriangle, X
} from 'lucide-react';
import { patientDocumentsApi } from '../api';
import type { PatientDocument, DocumentCategory } from '../types';
import { useAuth } from '../../../core/auth/AuthProvider';
import { UploadDocumentModal } from './UploadDocumentModal';

interface PatientDocumentListProps {
  patientId: string;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  RADIOGRAPH: 'Radiografía',
  LAB_RESULT: 'Resultado de Lab.',
  PRESCRIPTION: 'Receta',
  CONSENT: 'Consentimiento',
  IDENTIFICATION: 'Identificación',
  CLINICAL_IMAGE: 'Imagen Clínica',
  REFERRAL: 'Referencia',
  OTHER: 'Otro',
};

export function PatientDocumentList({ patientId }: PatientDocumentListProps) {
  const { activeRole } = useAuth();
  const canManage = activeRole === 'OWNER' || activeRole === 'PROFESSIONAL';

  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<PatientDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await patientDocumentsApi.listDocuments(patientId);
      setDocuments(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Error al cargar los documentos.');
      } else {
        setError('Error al cargar los documentos.');
      }
    } finally {
      setLoading(false);
    }
  }, [patientId, canManage]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleDownload = async (doc: PatientDocument) => {
    try {
      setDownloadingId(doc.id);
      const res = await patientDocumentsApi.getDownloadUrl(doc.id);
      // Abrir en nueva pestaña o crear un enlace temporal (crear enlace es mejor para descargar)
      const link = document.createElement('a');
      link.href = res.downloadUrl;
      // Tratar de forzar descarga si es posible
      link.setAttribute('download', doc.originalFileName);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      console.error('Error al descargar documento:', err);
      alert('Error al obtener el enlace de descarga.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      setIsDeleting(true);
      await patientDocumentsApi.deleteDocument(documentToDelete.id);
      setDocuments(prev => prev.filter(d => d.id !== documentToDelete.id));
      setDocumentToDelete(null);
    } catch (err: unknown) {
      console.error('Error al eliminar documento:', err);
      alert('Error al eliminar el documento.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!canManage) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-blue-500" size={20} />
            Documentos del Paciente
          </h2>
          <p className="text-sm text-slate-500 mt-1">Archivos y estudios clínicos adjuntos</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shrink-0 text-sm"
        >
          <Plus size={16} />
          Subir Documento
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={fetchDocuments} className="p-2 hover:bg-red-100 rounded-lg transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl">
          <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText size={24} />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Sin documentos</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">No hay ningún documento adjunto a este paciente. Haz clic en "Subir Documento" para añadir uno.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold bg-slate-50/50">
                <th className="px-4 py-3 rounded-tl-lg">Archivo</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Tamaño</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right rounded-tr-lg">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                        {doc.mimeType.includes('image') ? <ImageIcon size={16} /> : <FileText size={16} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate max-w-[180px] sm:max-w-[240px]" title={doc.originalFileName}>
                          {doc.originalFileName}
                        </p>
                        <p className="text-xs text-slate-500">{doc.mimeType.split('/')[1]?.toUpperCase()}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                      {CATEGORY_LABELS[doc.category] || doc.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatFileSize(doc.sizeBytes)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(doc.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Descargar"
                      >
                        {downloadingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      </button>
                      <button
                        onClick={() => setDocumentToDelete(doc)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUploadModal && (
        <UploadDocumentModal
          patientId={patientId}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            fetchDocuments();
          }}
        />
      )}

      {documentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Eliminar Documento</h3>
                </div>
                <button
                  onClick={() => setDocumentToDelete(null)}
                  disabled={isDeleting}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-4 text-slate-600 text-sm space-y-3">
                <p>
                  ¿Estás seguro de que deseas eliminar el documento <strong>{documentToDelete.originalFileName}</strong>?
                </p>
                <p>El documento se ocultará del expediente y no podrá restaurarse desde la aplicación.</p>
              </div>
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setDocumentToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 font-medium text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm inline-flex items-center gap-2"
              >
                {isDeleting && <Loader2 size={16} className="animate-spin" />}
                {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
