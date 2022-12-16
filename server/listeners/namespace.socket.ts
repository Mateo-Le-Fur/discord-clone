import { NamespaceInterface } from "../interfaces/Namespace";
import { Server, Socket } from "socket.io";
import { User, UserNamespace, Room, UserHasNamespace } from "../models";
import path from "path";
import sharp from "sharp";
import { getNumberOfUsers, getNumberOfUserNamespaces } from "../query/namespace.query";
import { getRandomImage } from "../utils/getRandomImage";
import { SocketCustom } from "../interfaces/SocketCustom";
import { UpdateNamespaceInterface } from "../interfaces/UpdateNamespaceInterface";
import runService from "../services/runService";
import { workerData } from "worker_threads";
import { Op } from "sequelize";

const { unlinkImage } = require("../utils/unlinckImage");

class NamespacesManager {

  private _ios: Server;
  private _clients: Map<number, string>
  private readonly _userLimit: number;
  private readonly _userNamespacesLimit: number;


  constructor(ios: Server, clients: Map<number, string>) {
    this._ios = ios;
    this._clients = clients;
    this._userLimit = 3000;
    this._userNamespacesLimit = 10;
  }

  public async getUserNamespaces(
    socket: SocketCustom
  ) {
    const userId = socket.request.user?.id;

    let foundUsersNamespace = (
      await User.findByPk(userId, {
        include: {
          model: UserNamespace,
          as: "namespaces",
          include: ["rooms"]
        }
      })
    )?.toJSON();


    const namespaces = foundUsersNamespace?.namespaces.map(
      (namespace: NamespaceInterface) => {
        return {
          ...namespace,
          imgUrl: `${process.env.DEV_AVATAR_URL}/namespace/${
            namespace.id
          }/${Date.now()}/avatar`
        };
      }
    );

    socket.emit("namespaces", namespaces);
  }


  public async getNamespaceUsers(
    nsSocket: Socket,
    namespaceId: number,
  ) {
    const t0 = performance.now();


    let foundNamespace = await UserNamespace.findByPk(namespaceId);

    const nbUsers = await getNumberOfUsers(namespaceId);

    let users = await foundNamespace?.getUsers({
      attributes: { exclude: ["password"] },
      limit: 50,
      offset: 0,
      raw: true,
      nest: true
    });


    const updateUser = users?.map((element: User) => {
      const checkIfUserConnected = this._clients.get(element.id);

      return {
        ...element,
        avatarUrl: `${process.env.DEV_AVATAR_URL}/user/${
          element.id
        }/${Date.now()}/avatar`,
        status: checkIfUserConnected ? "online" : "offline"
      };
    });


    const t1 = performance.now();

    nsSocket.emit("userList", {
      users: updateUser,
      numberOfUsers: nbUsers.count
    });

    console.log(`get user list : ${t1 - t0} ms`);
  }

  public async loadMoreUser(
    nsSocket: Socket,
    data: { currentArrayLength: number; namespaceId: number },
  ) {
    const { currentArrayLength, namespaceId } = data;

    const t0 = performance.now();

    let namespace = await UserNamespace.findByPk(namespaceId);

    const foundUser = await namespace?.getUsers({
      attributes: { exclude: ["password"] },
      limit: 50,
      offset: currentArrayLength,
      raw: true,
      nest: true
    });

    const updateUser = foundUser?.map((element) => {
      const checkIfUserConnected = this._clients.get(element.id);

      return {
        ...element,
        avatarUrl: `${process.env.DEV_AVATAR_URL}/user/${
          element.id
        }/${Date.now()}/avatar`,
        status: checkIfUserConnected ? "online" : "offline"
      };
    });

    const t1 = performance.now();

    console.log(`load more user : ${t1 - t0} ms`);

    nsSocket.emit("loadMoreUser", updateUser);
  }

  public async createNamespace(socket: SocketCustom, data: NamespaceInterface) {
    console.time("create");

    const userId = socket.request.user?.id;

    const { count } = await getNumberOfUserNamespaces(userId)

    if (count >= this._userNamespacesLimit) {
      throw new Error(`Tu ne peut pas créer/rejoindre plus de ${this._userNamespacesLimit} serveur`)
    }

    const imgName = data.imgUrl ? Date.now() : null;

    if (data.imgUrl) {
      await sharp(data.imgUrl)
        .resize(150, 150)
        .webp({
          quality: 80,
          effort: 0
        })
        .toFile(path.join(__dirname, `../images/${imgName}.webp`));
    }

    const createNamespace = await UserNamespace.create({
      name: data.name,
      inviteCode: data.inviteCode,
      imgUrl: imgName ? `/images/${imgName}` : `/images/${getRandomImage()}`
    });

    const { id } = createNamespace.toJSON();

    await Room.create({
      name: "# Général",
      index: 1,
      namespaceId: id
    });


    await UserHasNamespace.create({
      user_id: userId,
      namespace_id: id,
      admin: true
    });

    const foundUserNamespace  = (
      await User.findByPk(userId, {
        include: {
          model: UserNamespace,
          as: "namespaces",
          include: ["rooms"],
          where: {
            id
          }
        }
      })
    )?.toJSON();

   const [ namespaces ] = [...foundUserNamespace?.namespaces];

    const userNamespace = {
      ...namespaces,
      imgUrl: `${process.env.DEV_AVATAR_URL}/namespace/${
        namespaces?.id
      }/${Date.now()}/avatar`
    };

    socket.emit("createdNamespace", [userNamespace]);

    console.timeEnd("create");
  }

  public async updateNamespace(socket: SocketCustom, data: UpdateNamespaceInterface) {
    const { namespaceId, values, avatar } = data;

    const userId = socket.request.user?.id;

    const checkIfUserIsAdmin = await UserHasNamespace.findOne({
      where: {
        user_id: userId,
        namespace_id: namespaceId,
        admin: true
      },
      raw: true
    });

    if (!checkIfUserIsAdmin) {
      throw new Error("Tu dois être administrateur pour modifier le serveur");
    }

    const avatarName = avatar ? Date.now() : null;

    if (avatar) {
      await sharp(avatar)
        .resize(100, 100)
        .webp({
          quality: 80,
          effort: 0
        })
        .toFile(path.join(__dirname, `../images/${avatarName}.webp`));

    }

    const { imgUrl: oldAvatar } = await UserNamespace.findByPk(namespaceId, {
      raw: true
    }) as UserNamespace;

    await UserNamespace.update(
      {
        name: values.name,
        inviteCode: values.inviteCode,
        imgUrl: avatarName ? `/images/${avatarName}` : oldAvatar
      },
      {
        where: {
          id: namespaceId
        }
      }
    );

    let updateNamespace = (
      await UserNamespace.findByPk(namespaceId, {
        include: {
          model: Room,
          as: "rooms"
        }
      })
    )?.toJSON();

    updateNamespace = {
      ...updateNamespace,
      imgUrl: `${
        process.env.DEV_AVATAR_URL
      }/namespace/${namespaceId}/${Date.now()}/avatar`
    };

    this._ios.of(`${namespaceId}`).emit("updateNamespace", updateNamespace);
  }

  async deleteNamespace(socket: SocketCustom, data: { id: number }) {
    const { id } = data;

    const userId = socket.request.user?.id;

    const checkIfUserIsAdmin = await UserHasNamespace.findOne({
      where: {
        user_id: userId,
        namespace_id: id,
        admin: true
      },
      raw: true
    });

    if (!checkIfUserIsAdmin) {
      throw new Error("Tu dois être administrateur pour supprimer le serveur");
    }

    this._ios.of(`${id}`).emit("deleteNamespace", { id });

    const namespace = await UserNamespace.findByPk(id, {
      raw: true
    });

    unlinkImage(namespace?.imgUrl);

    await UserNamespace.destroy({
      where: {
        id
      }
    });

    this._ios._nsps.delete(`/${id}`);
  }


  public async joinInvitation(
    socket: SocketCustom,
    data: Partial<NamespaceInterface>
  ) {
    const userId = socket.request.user?.id;


    const foundNamespace = (
      await UserNamespace.findOne({
        where: {
          invite_code: data.inviteCode
        }
      })
    )?.toJSON() as UserNamespace;

    if (!foundNamespace) throw new Error("Code non valide");

    const { id: namespaceId } = foundNamespace

    const checkIfUserAlreadyHasServer = await UserHasNamespace.findOne({
      where: {
        user_id: userId,
        namespace_id: namespaceId
      }
    });

    let { count } = await getNumberOfUsers(namespaceId);
    const checkIfServerIsFull = count >= this._userLimit;

    if (checkIfUserAlreadyHasServer)
      throw new Error("Tu as déjà rejoint ce serveur");

    if (checkIfServerIsFull) throw new Error("Le serveur est plein");

    await UserHasNamespace.create({
      user_id: userId,
      namespace_id: namespaceId
    });

    let foundUserNamespaces = (
      await User.findByPk(userId, {
        include: {
          model: UserNamespace,
          as: "namespaces",
          include: ["rooms"],
          where: {
            inviteCode: data.inviteCode
          }
        }
      })
    )?.toJSON();

    const [namespaces] = [...foundUserNamespaces?.namespaces];


    const userNamespaces = {
      ...namespaces,
      imgUrl: `${process.env.DEV_AVATAR_URL}/namespace/${
        namespaceId
      }/${Date.now()}/avatar`
    };

    let foundNamespaceUser = (
      await UserNamespace.findByPk(namespaceId, {
        include: [
          {
            model: User,
            as: "users",
            attributes: { exclude: ["password"] },
            where: {
              id: userId
            }
          }
        ]
      })
    )?.toJSON();

    const [ users ] = [...foundNamespaceUser?.users]

    const user = {
      ...users,
      avatarUrl: `${
        process.env.DEV_AVATAR_URL
      }/user/${userId}/${Date.now()}/avatar`,
      status: "online"
    };

    socket.emit("createdNamespace", [userNamespaces]);
    this._ios.of(`/${namespaceId}`).emit("userJoinNamespace", [user]);
  }


  async leaveNamespace(socket: SocketCustom, data: { id: number }) {

    const { id: namespaceId } = data;

    const userId = socket.request.user?.id;

    await UserHasNamespace.destroy({
      where: {
        user_id: userId,
        namespace_id: namespaceId
      }
    });

    this._ios.of(`/${namespaceId}`).emit("userLeaveNamespace", { id: userId });
  }
}

export { NamespacesManager };