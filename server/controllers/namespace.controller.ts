import { Request, Response } from "express";
import { RequestCustom } from "../interfaces/ReqUserInterface";

import { Namespace, UserHasNamespace } from "../models";
import path from "path";

class namespaceController {
  constructor() {
    this.getNamespaceAvatar = this.getNamespaceAvatar.bind(this);
    this.leaveNamespace = this.leaveNamespace.bind(this);
  }
  async getNamespaceAvatar(req: Request, res: Response) {
    const { id } = req.params;

    const namespace = await Namespace.findByPk(id, { raw: true });

    res.sendFile(path.join(__dirname, `..${namespace?.imgUrl}.webp`));
  }

  async leaveNamespace(req: RequestCustom, res: Response) {
    const { id } = req.params;

    await UserHasNamespace.destroy({
      where: {
        user_id: req.user?.id,
        namespace_id: id,
      },
    });

    res.end();
  }
}

export default new namespaceController();
