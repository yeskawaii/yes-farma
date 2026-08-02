# Contexto del Proyecto: Yes Farma

## Problema que resuelve
Las clínicas pequeñas y profesionales de la salud individuales suelen depender de herramientas genéricas (hojas de cálculo, agendas físicas o software legacy costoso) para administrar sus consultorios. Yes Farma busca unificar en una plataforma SaaS la gestión de citas, expedientes, pacientes y roles administrativos de manera segura y moderna.

## Alcance Inicial y Usuarios Objetivo
El primer caso de uso está diseñado para un consultorio odontológico individual. 
La usuaria inicial prevista es una odontóloga que administrará su propio consultorio, sus expedientes clínicos y su agenda.

## Visión Futura
La arquitectura soporta escalabilidad clínica. A futuro se proyecta:
- Consultorios individuales y clínicas con varios profesionales.
- Asistentes administrativos.
- Múltiples especialidades médicas (odontología como el primer módulo especializado).
- Múltiples clínicas por usuario.
- Expedientes clínicos, odontogramas, archivos adjuntos.
- Auditorías del sistema.
- Manejo de suscripciones, pagos y administración del modelo SaaS.

## Fuera del MVP Inicial
Actualmente **NO** existen ni se han implementado:
- Módulo de pacientes y agenda.
- Expedientes y odontograma.
- Subida de archivos clínicos.
- Pagos o suscripciones SaaS.
- Registro público (se crea el propietario vía script interno).
- Recuperación de contraseñas.

## Glosario Fundamental

- **Clinic (Clínica):** Entidad raíz del modelo de tenencia (tenant). Representa un espacio físico o virtual de trabajo (ej. "Consultorio Dental Yescas").
- **User (Usuario):** Persona registrada en la plataforma. Su acceso a los datos depende puramente de sus membresías.
- **Membership (Membresía):** La unión entre un `User` y una `Clinic`. Contiene el rol del usuario dentro de ese contexto clínico.
- **Session (Sesión):** Token persistido de acceso que vincula temporalmente a un usuario, y de forma opcional a una clínica activa (`activeClinicId`), protegiendo endpoints.
- **ProfessionalProfile (Perfil Profesional):** Datos médicos y de licencia que se asocian a una membresía cuando el rol es de índole médico (profesional).
