import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import { UserRole } from './users/enums/user-role.enum';

// Same IPv4-first fix as main.ts — needed here too since this runs as its
// own process (ts-node), separate from the main app bootstrap.
setDefaultResultOrder('ipv4first');

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  try {
    await usersService.create({
      name: 'Super Admin',
      phone: '9999900001',
      password: 'password123',
      role: UserRole.SUPER_ADMIN,
    });

    await usersService.create({
      name: 'Admin',
      phone: '9999900002',
      password: 'password123',
      role: UserRole.ADMIN,
    });

    await usersService.create({
      name: 'Adil Ansari',
      phone: '9999900003',
      password: 'password123',
      role: UserRole.FIELD_AGENT,
      coverageLocalities: ['ABUL_FAZAL_ENCLAVE', 'JAMIA_NAGAR'],
    });

    await usersService.create({
      name: 'Mohd. Salman',
      phone: '9999900004',
      password: 'password123',
      role: UserRole.OWNER,
    });

    await usersService.create({
      name: 'Zainab Ali',
      phone: '9999900005',
      password: 'password123',
      role: UserRole.RENTER,
    });

    console.log('✅ Seed complete — test users created for each role (password: password123)');
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
  } finally {
    await app.close();
  }
}

seed();
