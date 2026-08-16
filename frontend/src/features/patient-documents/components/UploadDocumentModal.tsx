import { useState, useRef } from 'react';
import { Upload, X, AlertCircle, CheckCircle, Loader2, FileText, Image as ImageIcon } from 'lucide-react';
import { patientDocumentsApi } from '../api';
import { Modal } from '../../../shared/components/Modal/Modal';
import {
  DOCUMENT_CATEGORIES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from '../types';
import type { DocumentCategory, AllowedMimeType } from '../types';

interface UploadDocumentModalProps {
  patientId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  RADIOGRAPH: 'Radiografía',
  LAB_RESULT: 'Resultado de Laboratorio',
  PRESCRIPTION: 'Receta Médica',
  CONSENT: 'Consentimiento Informado',
  IDENTIFICATION: 'Identificación',
  CLINICAL_IMAGE: 'Imagen Clínica',
  REFERRAL: 'Referencia Médica',
  OTHER: 'Otro',
};

export function UploadDocumentModal({ patientId, onClose, onSuccess }: UploadDocumentModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'completing' | 'success'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];

      if (!ALLOWED_MIME_TYPES.includes(selectedFile.type as AllowedMimeType)) {
        setError('Tipo de archivo no permitido. Solo se aceptan PDF, JPEG, PNG y WEBP.');
        setFile(null);
        return;
      }

      if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        setError(`El archivo excede el límite de 15 MB. Tamaño actual: ${formatFileSize(selectedFile.size)}`);
        setFile(null);
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecciona un archivo.');
      return;
    }
    if (!category) {
      setError('Por favor, selecciona una categoría.');
      return;
    }

    try {
      setStatus('uploading');
      setError(null);

      // 1. Obtener URL de subida
      const uploadRes = await patientDocumentsApi.createUploadUrl({
        patientId,
        category: category as DocumentCategory,
        mimeType: file.type as AllowedMimeType,
        sizeBytes: file.size,
        originalFileName: file.name,
      });

      // 2. Subir a R2 directamente
      await patientDocumentsApi.uploadToR2(uploadRes.uploadUrl, file);

      // 3. Completar subida
      setStatus('completing');
      await patientDocumentsApi.completeUpload(uploadRes.documentId);

      setStatus('success');
      setTimeout(() => {
        onSuccess();
      }, 1500);

    } catch (err: unknown) {
      setStatus('idle');
      if (err instanceof Error) {
        setError(err.message || 'Error al subir el documento.');
      } else {
        setError('Error al subir el documento.');
      }
    }
  };

  const isUploading = status === 'uploading' || status === 'completing' || status === 'success';

  return (
    <Modal
      onClose={onClose}
      closeOnBackdrop={!isUploading}
      closeOnEscape={!isUploading}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <Upload size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Subir Documento</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {status === 'success' ? (
            <div className="py-8 flex flex-col items-center justify-center text-center animate-in zoom-in-95">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle size={32} />
              </div>
              <h4 className="text-lg font-bold text-slate-900">Documento subido</h4>
              <p className="text-slate-500 mt-1">El archivo se ha guardado correctamente.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Categoría */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Categoría del Documento <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                  disabled={isUploading}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow text-slate-900"
                >
                  <option value="" disabled>Selecciona una categoría...</option>
                  {DOCUMENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Archivo */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Archivo <span className="text-red-500">*</span>
                </label>

                {!file ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <Upload className="mx-auto text-slate-400 mb-3" size={32} />
                    <p className="text-sm font-medium text-slate-700">Haz clic para seleccionar un archivo</p>
                    <p className="text-xs text-slate-500 mt-2">
                      PDF, JPEG, PNG, WEBP (Max. 15MB)
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-4 flex items-center gap-4 bg-slate-50">
                    <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0 text-slate-500">
                      {file.type.includes('image') ? <ImageIcon size={24} /> : <FileText size={24} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{file.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatFileSize(file.size)} • {file.type.split('/')[1].toUpperCase()}
                      </p>
                    </div>
                    <button
                      onClick={() => setFile(null)}
                      disabled={isUploading}
                      className="text-slate-400 hover:text-red-500 p-2 transition-colors disabled:opacity-50"
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept={ALLOWED_MIME_TYPES.join(',')}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </div>

        {status !== 'success' && (
          <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-200 bg-white border border-slate-300 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || !category || isUploading}
              className="px-5 py-2.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-blue-600 shadow-sm flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {status === 'uploading' ? 'Subiendo a la nube...' : 'Finalizando...'}
                </>
              ) : (
                'Subir Archivo'
              )}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
