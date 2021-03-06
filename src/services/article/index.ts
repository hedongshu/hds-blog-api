import { service, DarukContext, inject, provide } from "daruk";
import { Article } from "../../entity/article";
import Db from "../../glues/connection";
import { errors } from "../../glues/http-exception";
import * as crypto from "crypto-js";
import { generateToken, isArray, unique } from "../../util";
import { Repository, In, FindManyOptions } from "typeorm";
import { Category } from "../../entity/category";
import { Admin } from "../../entity/admin";
import { Comment } from "../../entity/comment";

interface article_params {
  title;
  img_url;
  content;
  seo_keyword;
  description;
  admin_id;
  category_id;
  status;
  sort_order;
}

interface article_list_params {
  category_id?;
  keyword?;
  status?;
  page_size?;
  page?;
}

@service()
export class ArticleSer {
  public ctx!: DarukContext;
  @inject("Db") public Db!: Db;

  /**创建 */
  public async create(params: article_params) {
    const repository = (await Db.getConnection()).getRepository(Article);

    const isExist = await repository.findOne({
      where: {
        title: params.title,
        deleted_at: null,
      },
    });

    if (Boolean(isExist)) {
      throw new errors.Existing("文章已经存在");
    }

    const article = new Article();
    article.title = params.title;
    article.description = params.description;
    article.img_url = params.img_url;
    article.content = params.content;
    article.seo_keyword = params.seo_keyword;
    article.status = params.status || 1;
    article.sort_order = params.sort_order;

    const admin = await (
      await Db.getRepository(Admin)
    ).findOne({ id: params.admin_id });
    if (admin) {
      article.admin_info = admin;
    }

    const category = await (
      await Db.getRepository(Category)
    ).findOne({
      id: params.admin_id,
    });
    if (category) {
      article.category_info = category;
    }

    try {
      const res = await Db.connection.manager.save(article);

      return [null, res];
    } catch (error) {
      return [error, null];
    }
  }

  /**查询 */
  public async detail(
    id: number,
    status: StatusTypes = StatusTypes.USER_STATUS_NORMAL
  ) {
    try {
      const repository = await Db.getRepository(Article);

      let article = await repository.findOne({
        relations: ["category_info", "admin_info"],
        where: {
          id: id,
          deleted_at: null,
        },
        cache: true,
      });

      if (!article) {
        throw new errors.AuthFailed("没有找到相关文章！");
      }

      let comment_count = await (await Db.getRepository(Comment))
        .createQueryBuilder("comment")
        .where("comment.article_id = :id", { id: id })
        .getCount();

      return [null, Object.assign({ comment_count }, article)];
    } catch (error) {
      console.log(error);
      return [error, null];
    }
  }

  // 删除
  public async destroy(id: number) {
    const repository = await Db.getRepository(Article);

    const article = await repository.findOne({ id: id, deleted_at: null });

    if (!article) {
      throw new global.errs.NotFound("没有找到文章");
    }

    try {
      // 软删除
      let res = await repository.softRemove(article);

      return [null, res];
    } catch (err) {
      return [err, null];
    }
  }

  // 更新用户
  public async update(id: number, v: article_params) {
    const repository = await Db.getRepository(Article);

    // 查询用户
    const article = await repository.findOne({ id: id });
    if (!article) {
      throw new global.errs.NotFound("没有找到相关用户");
    }

    // 更新用户
    article.title = v.title;
    article.description = v.description;
    article.img_url = v.img_url;
    article.content = v.content;
    article.seo_keyword = v.seo_keyword;
    article.status = v.status || 1;
    article.sort_order = v.sort_order;

    const admin = await (
      await Db.getRepository(Admin)
    ).findOne({
      id: v.admin_id,
    });

    if (admin) {
      article.admin_info = admin;
    }

    const category = await (
      await Db.getRepository(Category)
    ).findOne({
      id: v.category_id,
    });

    if (category) {
      article.category_info = category;
    }

    try {
      const res = await repository.save(article);
      return [null, res];
    } catch (err) {
      return [err, null];
    }
  }

  // 更新文章浏览次数
  public async updateBrowse(id: number, browse: number) {
    // 查询文章
    const repository = await Db.getRepository(Article);
    const article = await repository.findOne({ id: id });

    if (!article) {
      throw new global.errs.NotFound("没有找到相关文章");
    }
    // 更新文章浏览
    article.browse = browse;

    try {
      const res = await repository.save(article);

      return [null, res];
    } catch (err) {
      return [err, null];
    }
  }

  // 列表
  public async list(query: article_list_params) {
    const { category_id, keyword, page_size = 10, status, page = 1 } = query;

    try {
      const repository = await Db.getRepository(Article);
      let qb = repository
        .createQueryBuilder("article")
        .leftJoinAndSelect("article.admin_info", "admin_info")
        .leftJoinAndSelect("article.category_info", "category_info");

      if (status) {
        qb.where("article.status = :status", { status });
      }
      if (category_id) {
        qb.where("article.category_id = :category_id", { category_id });
      }

      if (keyword) {
        qb.where("article.content LIKE :keyword", {
          keyword: `%${keyword}%`,
        }).orWhere("article.title LIKE :keyword", { keyword: `%${keyword}%` });
      }

      const article = await qb
        .orderBy("article.sort_order", "DESC")
        .addOrderBy("article.created_at", "DESC")
        .take(page_size)
        .skip((page - 1) * page_size)
        .getManyAndCount();

      const data = {
        data: article[0],
        // 分页
        meta: {
          current_page: page,
          per_page: 10,
          count: article[1],
          total: article[1],
          total_pages: Math.ceil(article[1] / page_size),
        },
      };

      return [null, data];
    } catch (err) {
      console.log("err", err);
      return [err, null];
    }
  }
}
