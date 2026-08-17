import { useState, useEffect } from 'react';
import { X, Download, AlertCircle, Loader2 } from 'lucide-react';
import { patientDocumentsApi } from '../api';
import type { PatientDocument } from '../types';
import { Modal } from '../../../shared/components/Modal/Modal';

interface DocumentPreviewModalProps {
  document: PatientDocument;
  onClose: () => void;
}

export function DocumentPreviewModal({ document, onClose }: DocumentPreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchPreviewUrl = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await patientDocumentsApi.getPreviewUrl(document.id);
        if (isMounted) {
          setPreviewUrl(res.previewUrl);
        }
      } catch {
        if (isMounted) {
          setError('No se pudo cargar la vista previa.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPreviewUrl();
    return () => {
      isMounted = false;
    };
  }, [document.id]);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const res = await patientDocumentsApi.getDownloadUrl(document.id);
      const link = window.document.createElement('a');
      link.href = res.downloadUrl;
      link.setAttribute('download', document.originalFileName);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    } catch {
        alert('Error al obtener el enlace de descarga.');
    } finally {
      setIsDownloading(false);
    }
  };

  const isImage = document.mimeType.startsWith('image/');
  const isPdf = document.mimeType === 'application/pdf';

  return (
    <Modal onClose={onClose} closeOnBackdrop={true} closeOnEscape={true}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[92dvh] sm:h-[88dvh] overflow-hidden flex flex-col">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900 truncate" title={document.originalFileName}>
              {document.originalFileName}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {document.category} • {(document.sizeBytes / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              <span className="hidden sm:inline">{isDownloading ? 'Descargando...' : 'Descargar'}</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 flex items-center justify-center relative">
          {loading ? (
            <div className="flex flex-col items-center text-slate-400 gap-3">
              <Loader2 className="animate-spin" size={32} />
              <p className="text-sm font-medium">Cargando vista previa...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-red-500 gap-3 p-6 text-center">
              <AlertCircle size={40} className="text-red-400" />
              <p className="text-sm font-medium">{error}</p>
              <button
                onClick={handleDownload}
                className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-lg transition-colors text-sm"
              >
                <Download size={16} />
                Descargar documento
              </button>
            </div>
          ) : previewUrl ? (
            <>
              {isImage && (
                <div className="w-full h-full p-4 flex items-center justify-center overflow-auto">
                  <img
                    src={previewUrl}
                    alt={document.originalFileName}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
              {isPdf && (
                <iframe
                  src={previewUrl}
                  className="block w-full h-full border-0 bg-white"
                  title={document.originalFileName}
                />
              )}
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
