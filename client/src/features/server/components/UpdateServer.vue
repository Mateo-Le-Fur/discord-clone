<script setup lang="ts">
import uploadImgUrl from "@/assets/images/upload.svg";
import type { Namespace } from "@/shared/interfaces/Namespace";
import { generateInviteCode } from "@/utils/generateInviteCode";
import { onMounted, ref, watch } from "vue";
import { toFormValidator } from "@vee-validate/zod";
import { z } from "zod";
import { useField, useForm } from "vee-validate";
import { useSocket } from "@/shared/stores/socketStore";
import { useUser } from "@/shared/stores";

const socketStore = useSocket();
const userStore = useUser();

const newInviteCode = ref<string | null>(null);
let avatar = ref<File | null>();
let src = ref<string | ArrayBuffer | null>();

const props = defineProps<{
  currentNamespace: Namespace | undefined;
}>();

const emit = defineEmits<{
  (e: "closePopup"): void;
}>();

const validationSchema = toFormValidator(
  z.object({
    name: z
      .string({ required_error: "Le champ doit être remplie : (" })
      .min(1, "Minimum 1 caractères requis")
      .max(30, "Maximum 30 caractères"),

    inviteCode: z
      .string({ required_error: "Le champ doit être remplie : (" })
      .length(8, "Le code est composé de 8 caractères"),
  })
);

const { handleSubmit, setErrors } = useForm<Partial<Namespace>>({
  validationSchema,
});

const submit = handleSubmit(async (formValue: Partial<Namespace>) => {
  try {
    if (
      !(
        formValue.inviteCode === newInviteCode.value ||
        formValue.inviteCode === props.currentNamespace?.inviteCode
      )
    ) {
      setErrors({
        inviteCode: "Tu ne peux pas modifier le code",
      });
    }
    if (
      formValue.name !== props.currentNamespace?.name ||
      formValue.inviteCode !== props.currentNamespace?.inviteCode ||
      avatar.value
    ) {
      socketStore.activeNsSocket.emit(
        "updateNamespace",
        {
          ...formValue,
          namespaceId: props.currentNamespace?.id,
          imgBuffer: avatar.value ?? null,
        },
        (response: { status: string; message: string }) => {
          if (response.status === "ok") {
            emit("closePopup");
          } else {
            socketStore.setError(response.message);
          }
        }
      );
      socketStore.isNamespaceUpdated = false;
    }
  } catch (e: string | any) {
    console.error(e);
    throw e;
  }
});

const { value: nameValue, errorMessage: nameError } = useField("name");
const { value: codeValue, errorMessage: codeError } = useField("inviteCode");

onMounted(() => {
  nameValue.value = props.currentNamespace?.name;
  codeValue.value = props.currentNamespace?.inviteCode;
});

watch(newInviteCode, (newValue) => {
  codeValue.value = newValue;
});

function previewAvatar(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files![0];

  const reader = new FileReader();
  reader.readAsDataURL(file);

  reader.onloadend = () => {
    src.value = reader.result;
  };

  avatar.value = file;
}
</script>

<template>
  <div
    v-click-outside="() => emit('closePopup')"
    class="update-server d-flex flex-column align-items-center p-20"
  >
    <label for="file" class="label-file">
      <img
        :src="
          src
            ? src
            : currentNamespace.imgUrl
            ? currentNamespace.imgUrl
            : uploadImgUrl
        "
        style="color: white"
        alt="server-logo"
      />
    </label>
    <input
      @change="previewAvatar($event)"
      id="file"
      class="input-file"
      type="file"
    />
    <form
      @submit.prevent="submit"
      class="d-flex align-items-center flex-column"
    >
      <div class="d-flex g-15 mb-20">
        <div class="d-flex flex-column server-name">
          <label for="name">Nom du serveur</label>
          <input
            v-focus
            class="mb-10"
            v-model="nameValue"
            id="name"
            type="text"
          />
          <span class="form-error" v-if="nameError">{{ nameError }}</span>
        </div>
        <div class="d-flex flex-column server-invite-code">
          <label for="invite_code">Code d'invitation</label>
          <div class="d-flex align-items-center g-5">
            <input
              v-model="codeValue"
              readonly
              id="invite_code"
              class="mb-5"
              type="text"
            />
          </div>
          <div class="d-flex g-5">
            <div>
              <p class="mr-5">Générer un nouveau code</p>
            </div>
            <div
              @click="newInviteCode = generateInviteCode()"
              class="generate-code"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                <!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. -->
                <path
                  d="M386.3 160H336c-17.7 0-32 14.3-32 32s14.3 32 32 32H464c17.7 0 32-14.3 32-32V64c0-17.7-14.3-32-32-32s-32 14.3-32 32v51.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0s-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3s163.8-62.5 226.3 0L386.3 160z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div class="submit mb-5">
        <button>Enregistrer</button>
      </div>
      <p class="form-error" v-if="codeError">{{ codeError }}</p>
      <p class="form-error" v-if="socketStore.error">
        {{ socketStore.error }}
      </p>
    </form>
  </div>
</template>

<style scoped lang="scss">
.update-server {
  position: absolute;
  top: 40%;
  right: 50%;
  transform: translate(calc(50% + 35px), -50%);
  background-color: #282a2f;
  box-shadow: 3px 0px 10px 4px rgba(0, 0, 0, 0.5);
  width: 50%;

  img {
    width: 150px;
    height: 150px;
    border-radius: 50%;
  }

  label {
    color: #f4f4f4;
  }
  .server-name {
    width: 100%;
  }

  .server-invite-code {
    width: 100%;

    p {
      margin-left: 5px;
      font-size: 0.7rem;
    }
  }

  input {
    outline: none;
    background-color: var(--primary-3);
    width: 100%;
  }

  .generate-code {
    cursor: pointer;
    width: 15px;
    height: 15px;

    svg {
      fill: #f4f4f4;
    }
  }

  .submit {
    button {
      border: none;
      cursor: pointer;
      background-color: #236cab;
      padding: 10px;
      border-radius: 4px;
    }
  }
}
</style>
