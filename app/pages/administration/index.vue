<template>
  <div>
    <UPageHeader :title="$t('admin.title')" :description="$t('admin.description')" class="mb-6" />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <UCard class="cursor-pointer hover:ring-2 hover:ring-primary transition-all" @click="navigateTo('/administration/users')">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-users" class="text-primary text-xl" />
            <div>
              <h3 class="font-semibold">
                {{ $t('admin.usersTitle') }}
              </h3>
              <p class="text-sm text-gray-500">
                {{ $t('admin.usersDesc') }}
              </p>
            </div>
          </div>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ $t('admin.usersBody') }}
        </p>
      </UCard>

      <UCard class="cursor-pointer hover:ring-2 hover:ring-primary transition-all" @click="navigateTo('/administration/roles')">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-shield" class="text-primary text-xl" />
            <div>
              <h3 class="font-semibold">
                {{ $t('admin.rolesTitle') }}
              </h3>
              <p class="text-sm text-gray-500">
                {{ $t('admin.rolesDesc') }}
              </p>
            </div>
          </div>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ $t('admin.rolesBody') }}
        </p>
      </UCard>
    </div>
  </div>
</template>
