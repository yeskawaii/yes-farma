import { prisma } from '../infrastructure/database/prisma';
import { CryptoService } from '../modules/identity/infrastructure/CryptoService';
import { Prisma } from '../generated/prisma';

async function bootstrap() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
  const firstName = process.env.BOOTSTRAP_OWNER_FIRST_NAME;
  const lastName = process.env.BOOTSTRAP_OWNER_LAST_NAME;
  const clinicName = process.env.BOOTSTRAP_CLINIC_NAME;
  const clinicalSpecialty = process.env.BOOTSTRAP_CLINICAL_SPECIALTY ?? 'DENTISTRY';
  const specialtyCode = process.env.BOOTSTRAP_SPECIALTY_CODE || 'DENTISTRY';
  const license = process.env.BOOTSTRAP_PROFESSIONAL_LICENSE || null;
  const specialtyLicense = process.env.BOOTSTRAP_SPECIALTY_LICENSE || null;
  const professionalAddress = process.env.BOOTSTRAP_PROFESSIONAL_ADDRESS || null;
  const professionalPhone = process.env.BOOTSTRAP_PROFESSIONAL_PHONE || null;

  if (!email || !password || !firstName || !lastName || !clinicName) {
    console.error('Faltan variables de entorno requeridas para el bootstrap.');
    process.exit(1);
  }

  if (clinicalSpecialty !== 'DENTISTRY' && clinicalSpecialty !== 'PEDIATRICS') {
    console.error('BOOTSTRAP_CLINICAL_SPECIALTY debe ser DENTISTRY o PEDIATRICS.');
    process.exit(1);
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.error('El usuario owner ya existe.');
    process.exit(1);
  }

  const passwordHash = await CryptoService.hashPassword(password);

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const clinic = await tx.clinic.create({
        data: { name: clinicName, clinicalSpecialty },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          clinicId: clinic.id,
          role: 'OWNER',
        },
      });

      await tx.professionalProfile.create({
        data: {
          membershipId: membership.id,
          specialtyCode,
          professionalLicense: license,
          specialtyLicense,
          professionalAddress,
          professionalPhone,
        },
      });
    });
    console.log('✅ Owner, clínica y membresía creados exitosamente.', {
      email,
      clinic: clinicName,
      clinicalSpecialty,
      role: 'OWNER',
      specialtyCode,
      professionalLicense: license,
    });
  } catch (err) {
    console.error('Error durante el bootstrap:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrap();
